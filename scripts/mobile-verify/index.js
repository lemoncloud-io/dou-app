#!/usr/bin/env node
/**
 * `yarn mobile:verify` — run a feature's device scenario on the iOS simulator or the Android
 * emulator with one command. Opt-in and never a gate: not in CI, not a hook. What it does, in order:
 *
 *   preflight → machine lock → servers (web, Metro) → device → build or reuse → scenarios → clean up
 *
 * Every mechanical trap a person used to remember lives here, so the caller only reads the result.
 * The procedure around it (when to offer it, how to read the outcome) is
 * docs/config/skills/dou-device-verify/SKILL.md; the module doc is
 * apps/mobile/docs/release/device-verify.md.
 */
const fs = require('fs');
const path = require('path');

const { parseArgs, USAGE } = require('./args');
const { EXIT, EnvironmentError, formatProblems } = require('./errors');
const { loadAdapter } = require('./adapters');
const { listScenarios, selectScenarios, findUnknownFeatures } = require('./scenarios');
const { ROOT, findMainCheckout, missingLocalFiles, stateDirFor } = require('./checkout');
const { buildChildEnv, checkIosToolchain, checkAndroidToolchain } = require('./toolchain');
const { tryAcquireLock, releaseLock, scanHeavyWork, busyFixes } = require('./machine');
const { RANGES, pickPort, seedFrom } = require('./ports');
const { deriveEnv, writeEnvFile } = require('./envfile');
const { nativeSourceState, buildFingerprint } = require('./fingerprint');
const { startBackground, stopLiveChildren, httpGet, waitFor, sleep } = require('./proc');
const treeGuard = require('./treeGuard');
const ios = require('./ios');
const android = require('./android');

const FIXTURE = 'apps/mobile/e2e/fixtures/dev-account.json';
const OUTPUT_ROOT = 'tmp/mobile-verify';

const log = message => console.log(`[verify] ${message}`);

function timestamp() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function readState(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return {};
    }
}

function readNvmrc() {
    try {
        return fs.readFileSync(path.join(ROOT, '.nvmrc'), 'utf8').trim();
    } catch {
        return null;
    }
}

const isEnUs = locale => /^en[-_]US$/i.test(locale);

/** A different Node major than `.nvmrc` names is worth a line; a different minor is not. */
function nodeVersionWarning(running, wanted) {
    const major = version => version?.replace(/^v/, '').split('.')[0];
    if (!wanted || major(running) === major(wanted)) return null;
    return `Node ${running} is running; the repository's .nvmrc names ${wanted}. If something below fails oddly, nvm use first.`;
}

/** Everything that would stop the run, gathered before anything is started or locked. */
function preflight({ options, adapter, env }) {
    const problems = [];
    if (process.platform !== 'darwin') {
        problems.push({ message: 'The harness runs on macOS only (the iOS half needs Xcode).', fix: [] });
        return problems;
    }
    for (const bin of ['vite', 'react-native']) {
        if (!fs.existsSync(path.join(ROOT, 'node_modules', '.bin', bin))) {
            problems.push({
                message: `node_modules has no ${bin}; dependencies are not installed in this checkout.`,
                fix: [
                    'yarn install',
                    'Its postinstall then fails at pod-install in an agent shell ("Unicode Normalization not appropriate for ASCII-8BIT"); that is harmless — this runner installs pods itself with a UTF-8 locale.',
                    'The postinstall also reformats apps/mobile/package.json. If `git diff apps/mobile/package.json` shows only that reformat (you had no edit of your own there): git checkout -- apps/mobile/package.json',
                ],
            });
            break;
        }
    }
    problems.push(...missingLocalFiles({ platform: options.platform, web: options.web }));
    problems.push(...(options.platform === 'ios' ? checkIosToolchain(env) : checkAndroidToolchain(env)));
    if (!options.appOnly) problems.push(...adapter.preflight(env));
    for (const name of findUnknownFeatures(ROOT)) {
        problems.push({
            message: `apps/mobile/e2e/flows/${name} names no folder in apps/web/src/app/features.`,
            fix: ['Rename the flows folder to the web feature it covers.'],
        });
    }
    return problems;
}

/**
 * Take the machine lock, waiting while another device run holds it or foreign heavy work (a build,
 * someone's emulator) is going on. Waiting is the default because the other run usually ends; the
 * limit turns a stuck one into an exit 2 that names it.
 */
async function acquireMachine({ options, env }) {
    // Only the harness's own AVD is ever "ours"; see findHeavyWork.
    const ownAvd =
        options.platform === 'android' && android.avdName(env) === android.DEFAULT_AVD ? android.DEFAULT_AVD : null;
    const started = Date.now();
    const deadline = started + options.waitMinutes * 60_000;
    let lastReport = '';
    let lastProgress = started;
    for (;;) {
        const busy = scanHeavyWork(ownAvd);
        if (busy.length === 0) {
            const lock = tryAcquireLock({
                pid: process.pid,
                checkout: ROOT,
                platform: options.platform,
                appOnly: options.appOnly,
                since: new Date().toISOString(),
            });
            if (lock.acquired) return;
            busy.push({
                pid: lock.holder?.pid ?? '?',
                kind: lock.holder?.appOnly
                    ? `a hand-check hold (--app-only, ${lock.holder.platform})`
                    : `another device run${lock.holder?.platform ? ` (${lock.holder.platform})` : ''}`,
                cwd: lock.holder?.checkout ?? '(starting up)',
                hold: Boolean(lock.holder?.appOnly),
            });
        }
        const report = busy.map(b => `  pid ${b.pid}  ${b.kind}  in ${b.cwd}`).join('\n');
        if (Date.now() >= deadline) {
            throw new EnvironmentError(
                `The machine is busy with other device work:\n${report}`,
                busyFixes(busy, android.DEFAULT_AVD)
            );
        }
        if (report !== lastReport) {
            log(`Waiting for other device work to finish (up to ${options.waitMinutes} min):\n${report}`);
            lastReport = report;
            lastProgress = Date.now();
        } else if (Date.now() - lastProgress >= 2 * 60_000) {
            // A silent wait looks like a hang to whoever reads the output.
            const waited = Math.round((Date.now() - started) / 60_000);
            log(`Still waiting: ${waited} of ${options.waitMinutes} min.`);
            lastProgress = Date.now();
        }
        await sleep(20_000);
    }
}

async function startServers({ options, env, ports, outDir }) {
    const servers = [];
    if (options.web === 'local') {
        log(`Starting this checkout's web on http://localhost:${ports.web}`);
        servers.push(
            startBackground(
                path.join(ROOT, 'node_modules', '.bin', 'vite'),
                ['--port', String(ports.web), '--strictPort', '--host', 'localhost'],
                {
                    cwd: path.join(ROOT, 'apps', 'web'),
                    env,
                    logFile: path.join(outDir, 'web.log'),
                }
            )
        );
    }
    log(`Starting Metro on port ${ports.metro}`);
    servers.push(
        startBackground(
            path.join(ROOT, 'node_modules', '.bin', 'react-native'),
            ['start', '--port', String(ports.metro)],
            {
                cwd: path.join(ROOT, 'apps', 'mobile'),
                env,
                logFile: path.join(outDir, 'metro.log'),
            }
        )
    );
    const webReady =
        options.web !== 'local' ||
        (await waitFor(async () => (await httpGet(`http://localhost:${ports.web}/`))?.status === 200, {
            timeoutMs: 120_000,
        }));
    const metroReady = await waitFor(
        async () => (await httpGet(`http://localhost:${ports.metro}/status`))?.body.includes('packager-status:running'),
        { timeoutMs: 120_000 }
    );
    if (!webReady || !metroReady) {
        servers.forEach(s => s.stop());
        throw new EnvironmentError(`${webReady ? 'Metro' : 'The web dev server'} did not start.`, [
            `Read ${path.join(outDir, webReady ? 'metro.log' : 'web.log')}`,
        ]);
    }
    return servers;
}

/**
 * Ask Metro for the bundle once before the app does. The first build of it takes long enough that a
 * freshly launched app can sit on a white screen past a scenario's first wait.
 */
async function warmBundle(metroPort, platform) {
    log('Warming the Metro bundle…');
    const url = `http://localhost:${metroPort}/src/main.bundle?platform=${platform}&dev=true&minify=false`;
    // Best effort: a dropped connection here only means the app builds the bundle itself.
    let response = await httpGet(url, 300_000);
    if (response?.status !== 200) response = await httpGet(url, 300_000);
    if (response?.status !== 200) {
        log(`Metro answered ${response?.status ?? 'nothing'} for the bundle; the app will retry.`);
    }
}

/** Build when the last build is not current (or --rebuild), install, and remember what was built. */
async function prepareApp({ options, env, state, stateDir, envFile, ports, device, outDir }) {
    const logFile = path.join(outDir, 'build.log');
    const inputFiles =
        options.platform === 'ios'
            ? [envFile, path.join(ROOT, 'apps/mobile/ios/Firebase/GoogleService-Info-Dev.plist')]
            : [envFile, path.join(ROOT, 'apps/mobile/android/app/src/dev/google-services.json')];
    const fingerprint = buildFingerprint({
        platform: options.platform,
        sourceState: nativeSourceState(ROOT),
        inputFiles,
        settings: { metroPort: ports.metro },
    });
    const platformState = (state[options.platform] ??= {});

    if (options.platform === 'ios') {
        let app = ios.appPath(stateDir);
        if (options.rebuild || platformState.fingerprint !== fingerprint || !app) {
            await ios.ensurePods({ root: ROOT, env, state: platformState, logFile, log });
            log(
                `Building "${ios.SCHEME}" / "${ios.CONFIGURATION}" (log: ${logFile}) — several minutes on a cold checkout…`
            );
            app = await ios.build({
                root: ROOT,
                env,
                stateDir,
                udid: device.id,
                envFile,
                metroPort: ports.metro,
                logFile,
            });
            platformState.fingerprint = fingerprint;
        } else {
            log('The last iOS build is current; reusing it.');
        }
        ios.install(device.id, app, env);
    } else {
        let apk = android.harnessApk(stateDir);
        if (options.rebuild || platformState.fingerprint !== fingerprint || !fs.existsSync(apk)) {
            log(`Building devDebug (log: ${logFile}) — several minutes on a cold checkout…`);
            apk = await android.build({ root: ROOT, env, stateDir, envFile, metroPort: ports.metro, logFile });
            platformState.fingerprint = fingerprint;
        } else {
            log('The last Android build is current; reusing it.');
        }
        android.install({ root: ROOT, serial: device.id, apk, env, log });
        android.forwardPorts(device.id, options.web === 'local' ? [ports.web, ports.metro] : [ports.metro], env);
    }
}

async function main(argv) {
    let options;
    try {
        options = parseArgs(argv);
    } catch (error) {
        console.error(`${error.message}\n\n${USAGE}`);
        return EXIT.ENVIRONMENT;
    }
    if (options.help) {
        console.log(USAGE);
        return EXIT.PASS;
    }

    const adapter = loadAdapter();
    const scenarios = listScenarios(ROOT, adapter);
    if (options.list) {
        for (const s of scenarios) console.log(`${s.id}${s.tags.length ? `  [${s.tags.join(', ')}]` : ''}`);
        return EXIT.PASS;
    }
    let selected = [];
    try {
        if (!options.appOnly) selected = selectScenarios(scenarios, options);
    } catch (error) {
        console.error(error.message);
        return EXIT.ENVIRONMENT;
    }

    const stateDir = stateDirFor(ROOT);
    fs.mkdirSync(stateDir, { recursive: true });
    const env = buildChildEnv({ stateDir });
    const problems = preflight({ options, adapter, env });
    if (problems.length) {
        if (findMainCheckout(ROOT)) {
            console.error(
                'This checkout is a git worktree; gitignored files have to be copied in from the main checkout.\n'
            );
        }
        console.error(formatProblems(problems));
        return EXIT.ENVIRONMENT;
    }
    const warning = options.appOnly ? null : adapter.versionWarning?.(env);
    if (warning) log(warning);
    const nodeWarning = nodeVersionWarning(process.version, readNvmrc());
    if (nodeWarning) log(nodeWarning);

    const outDir = path.join(ROOT, OUTPUT_ROOT, `${timestamp()}-${options.platform}`);
    fs.mkdirSync(outDir, { recursive: true });
    log(`Output: ${outDir}`);

    // Cleanup runs once, on a normal end, an error, or Ctrl-C — whichever comes first.
    const cleanups = [];
    let cleanedUp = false;
    const cleanUp = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        // A build or the scenario tool still running goes first, before the device it drives.
        stopLiveChildren();
        for (const step of cleanups.reverse()) {
            try {
                step();
            } catch (error) {
                console.error(`[verify] cleanup step failed: ${error.message}`);
            }
        }
    };
    // In --app-only the run holds until stopped, and a stop is its normal end.
    let holding = false;
    const onSignal = () => {
        cleanUp();
        process.exit(holding ? EXIT.PASS : 130);
    };
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
    // A closed terminal or pane, and a crash in the runner, would otherwise leave the servers, the
    // device and the lock behind.
    process.on('SIGHUP', onSignal);
    const onCrash = error => {
        console.error(
            `\nThe runner itself failed — this is a harness bug, not a scenario failure:\n${error?.stack ?? error}`
        );
        cleanUp();
        process.exit(EXIT.ENVIRONMENT);
    };
    process.on('uncaughtException', onCrash);
    process.on('unhandledRejection', onCrash);

    try {
        await acquireMachine({ options, env });
        cleanups.push(() => releaseLock());

        // The guarded files are put back right after the build (below); this cleanup does it only when
        // the run ends before that, and it never touches what changed after the build.
        const before = treeGuard.snapshot(ROOT);
        let treeRestored = false;
        const restoreTree = () => {
            if (treeRestored) return;
            treeRestored = true;
            const restored = treeGuard.restore(ROOT, before);
            if (restored.length) log(`Restored what the build rewrote: ${restored.join(', ')}`);
        };
        cleanups.push(() => {
            restoreTree();
            const changed = treeGuard.changedSince(ROOT, before);
            if (changed.length) log(`Changed in the tree during the run (left as is): ${changed.join(', ')}`);
        });

        const stateFile = path.join(stateDir, 'state.json');
        const state = readState(stateFile);
        cleanups.push(() => fs.writeFileSync(stateFile, JSON.stringify(state, null, 2)));

        const seed = seedFrom(ROOT);
        const web =
            options.web === 'local' ? await pickPort({ preferred: state.ports?.web, range: RANGES.web, seed }) : null;
        const metro = await pickPort({ preferred: state.ports?.metro, range: RANGES.metro, seed });
        if ((options.web === 'local' && !web) || !metro) {
            throw new EnvironmentError('No free port for the web dev server or Metro.');
        }
        const ports = { web: web ?? state.ports?.web, metro };
        state.ports = ports;

        const envFile = path.join(stateDir, 'build.env');
        writeEnvFile(
            envFile,
            deriveEnv({
                localText: fs.readFileSync(path.join(ROOT, 'apps/mobile/.env'), 'utf8'),
                devText: fs.readFileSync(path.join(ROOT, 'apps/mobile/.env.dev'), 'utf8'),
                web: options.web,
                webUrl: `http://localhost:${ports.web}`,
            })
        );

        const servers = await startServers({ options, env, ports, outDir });
        cleanups.push(() => servers.forEach(server => server.stop()));

        const device = { id: null };
        if (options.platform === 'ios') {
            device.id = ios.ensureSimulator(env, log);
            log(`Booting simulator ${ios.SIM_NAME} (${device.id})`);
            // Registered before the boot, so a boot that fails or is interrupted still shuts it down.
            if (!options.keepDevice) cleanups.push(() => ios.shutdown(device.id, env));
            await ios.bootSimulator(device.id, env, { show: options.showDevice });
        } else {
            const name = android.ensureAvd(env, log);
            log(`Booting emulator ${name}`);
            const booted = await android.bootEmulator({
                env,
                name,
                show: options.showDevice,
                logFile: path.join(outDir, 'device.log'),
                // Called for the harness AVD it adopted as well as one it started; never for anything else.
                onStarted: serial => {
                    if (!options.keepDevice) cleanups.push(() => android.shutdown(serial, env));
                },
            });
            device.id = booted.serial;
        }

        // Scenarios select by English text and the sign-in assumes the +1 country preset. A device the
        // harness creates starts in en-US; one it adopts (DOU_VERIFY_AVD, a changed simulator) may not.
        const deviceLocale = (options.platform === 'ios' ? ios : android).locale(device.id, env);
        if (deviceLocale && !isEnUs(deviceLocale)) {
            log(
                `The device's locale is ${deviceLocale}, not en-US: text selectors and the +1 sign-in preset assume en-US.`
            );
        }

        await prepareApp({ options, env, state, stateDir, envFile, ports, device, outDir });
        restoreTree();
        await warmBundle(ports.metro, options.platform);

        const platform = options.platform === 'ios' ? ios : android;
        if (options.appOnly) {
            platform.launch(device.id, env);
            await sleep(15_000);
            platform.screenshot(device.id, path.join(outDir, 'launch.png'), env);
            holding = true;
            console.log('');
            log(`The app is up on ${options.platform} device ${device.id} — this checkout's build, launched once.`);
            if (options.web === 'local') log(`Web: http://localhost:${ports.web}   Metro: ${ports.metro}`);
            log(`Screenshot after launch: ${path.join(outDir, 'launch.png')}`);
            log(`Holding the device, web and Metro up for hand checks. Stop with Ctrl-C, or: kill ${process.pid}`);
            // A signal ends the hold (onSignal); the timer only keeps the process alive until then.
            await new Promise(() => setInterval(() => undefined, 60_000));
        }
        if (options.record) {
            const recorder = platform.startRecording(
                device.id,
                path.join(outDir, 'run.mp4'),
                env,
                path.join(outDir, 'device.log')
            );
            cleanups.push(() => recorder.stop());
        }

        const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, FIXTURE), 'utf8'));
        const vars = {
            APP_ID: options.platform === 'ios' ? ios.BUNDLE_ID : android.APP_ID,
            APP_SCHEME: options.platform === 'ios' ? ios.APP_SCHEME : android.APP_SCHEME,
            PLATFORM: options.platform,
            DOU_TEST_PHONE: process.env.DOU_VERIFY_PHONE || fixture.phone,
        };

        const results = [];
        for (const scenario of selected) {
            const scenarioDir = path.join(outDir, scenario.id.replace('/', '__'));
            fs.mkdirSync(scenarioDir, { recursive: true });
            log(`Running ${scenario.id} on ${options.platform} (${device.id})`);
            const result = await adapter.run({
                platform: options.platform,
                deviceId: device.id,
                flowFile: scenario.file,
                outDir: scenarioDir,
                vars,
                env,
                logFile: path.join(scenarioDir, `${adapter.name}.log`),
            });
            platform.screenshot(device.id, path.join(scenarioDir, 'final.png'), env);
            results.push({ scenario, result });
            log(`${result.passed ? 'PASS' : 'FAIL'}  ${scenario.id} — ${result.summary}`);
            for (const checkpoint of result.checkpoints) log(`  checkpoint: ${path.relative(ROOT, checkpoint)}`);
        }

        cleanUp();
        const failed = results.filter(r => !r.result.passed);
        console.log('');
        console.log(`${results.length - failed.length}/${results.length} scenario(s) passed on ${options.platform}.`);
        console.log(`Screenshots and logs: ${outDir}`);
        return failed.length ? EXIT.SCENARIO_FAILED : EXIT.PASS;
    } catch (error) {
        cleanUp();
        if (error instanceof EnvironmentError) {
            console.error(`\n${formatProblems([{ message: error.message, fix: error.fix }])}`);
            console.error(`Logs: ${outDir}`);
            return EXIT.ENVIRONMENT;
        }
        console.error(`\nThe runner itself failed — this is a harness bug, not a scenario failure:\n${error.stack}`);
        return EXIT.ENVIRONMENT;
    }
}

if (require.main === module) {
    main(process.argv.slice(2)).then(code => process.exit(code));
}

module.exports = { main, nodeVersionWarning, isEnUs };
