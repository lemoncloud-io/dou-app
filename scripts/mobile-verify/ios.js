/**
 * iOS simulator: the harness's own device, CocoaPods, the "Chatic Dev" / "Debug Dev" build, install.
 *
 * The harness owns one simulator, created on first use and named `DoU Verify`. Other sessions boot
 * and install onto the stock "iPhone 17 Pro" devices — a peer once launched its own probe app on a
 * simulator someone else was testing — and a device nobody else picks by name cannot be shared by
 * accident. Every simctl call names its UDID.
 */
const fs = require('fs');
const path = require('path');

const { EnvironmentError } = require('./errors');
const { probe, runLogged, startBackground } = require('./proc');
const { IOS_DEVICE_TYPE, pickIosRuntime } = require('./toolchain');
const { hashParts, hashFile } = require('./fingerprint');

const SIM_NAME = 'DoU Verify';
const BUNDLE_ID = 'io.chatic.dou.dev';
const APP_SCHEME = 'chatic-dev';
const SCHEME = 'Chatic Dev';
const CONFIGURATION = 'Debug Dev';
const IOS_DIR = 'apps/mobile/ios';

function simctl(args, env, timeoutMs = 60_000) {
    return probe('xcrun', ['simctl', ...args], { env, timeoutMs });
}

/** The harness simulator's UDID, creating it on the newest iOS 26 runtime when it does not exist. */
function ensureSimulator(env, log) {
    const devices = JSON.parse(simctl(['list', 'devices', '-j'], env).stdout).devices;
    for (const [runtime, list] of Object.entries(devices)) {
        const own = list.find(d => d.name === SIM_NAME && d.isAvailable);
        if (own && /iOS-26/.test(runtime)) return own.udid;
    }
    const runtime = pickIosRuntime(JSON.parse(simctl(['list', 'runtimes', '-j'], env).stdout));
    const type = JSON.parse(simctl(['list', 'devicetypes', '-j'], env).stdout).devicetypes.find(
        t => t.name === IOS_DEVICE_TYPE
    );
    log(`Creating the harness simulator "${SIM_NAME}" (${IOS_DEVICE_TYPE}, iOS ${runtime.version}).`);
    const created = simctl(['create', SIM_NAME, type.identifier, runtime.identifier], env);
    if (created.status !== 0) {
        throw new EnvironmentError(`Could not create the "${SIM_NAME}" simulator: ${created.stderr.trim()}`);
    }
    return created.stdout.trim();
}

async function bootSimulator(udid, env, { show }) {
    // `bootstatus -b` boots when needed and returns once the device is ready.
    const booted = simctl(['bootstatus', udid, '-b'], env, 300_000);
    if (booted.status !== 0) {
        throw new EnvironmentError(`The simulator ${udid} did not boot: ${booted.stderr.trim()}`, [
            `xcrun simctl shutdown ${udid}; xcrun simctl erase ${udid}   (then run again)`,
        ]);
    }
    // A simulator takes the Mac's region when it is created (`en_KR` on a Korean-region Mac).
    // Scenarios select by English text and the sign-in expects the US number format, so the harness
    // device is set to en_US; the app reads it at its next launch, which every scenario starts with.
    simctl(['spawn', udid, 'defaults', 'write', '-g', 'AppleLocale', '-string', 'en_US'], env);
    simctl(['spawn', udid, 'defaults', 'write', '-g', 'AppleLanguages', '-array', 'en'], env);
    if (show) probe('open', ['-a', 'Simulator', '--args', '-CurrentDeviceUDID', udid], { env });
}

/**
 * CocoaPods. `pod install` runs only when the inputs it reads changed since the last install in this
 * checkout. Otherwise the installed Pods are reused, and `Podfile.lock` is overwritten with the
 * installed `Manifest.lock` for the length of the build: the tree guard put back the committed
 * lockfile after the last run, and Xcode's "Check Pods Manifest.lock" phase refuses to build when
 * the two differ (an environment-specific hermes-engine checksum is enough). The guard restores it
 * again afterwards.
 */
async function ensurePods({ root, env, state, logFile, log }) {
    const iosDir = path.join(root, IOS_DIR);
    const manifest = path.join(iosDir, 'Pods', 'Manifest.lock');
    const inputs = hashParts(
        ['Podfile', 'Podfile.lock']
            .map(f => hashFile(path.join(iosDir, f)))
            .concat(hashFile(path.join(root, 'yarn.lock')))
    );
    if (fs.existsSync(manifest) && state.podInputs === inputs) {
        fs.copyFileSync(manifest, path.join(iosDir, 'Podfile.lock'));
        return;
    }
    log('Installing pods (first run in this checkout, or Podfile/yarn.lock changed)…');
    const result = await runLogged('pod', ['install'], { cwd: iosDir, env, logFile, timeoutMs: 20 * 60_000 });
    if (result.status !== 0) {
        throw new EnvironmentError('pod install failed.', [`Read ${logFile}`, 'Then retry with --rebuild.']);
    }
    state.podInputs = inputs;
}

function derivedDataDir(stateDir) {
    return path.join(stateDir, 'ios-derived-data');
}

function appPath(stateDir) {
    const products = path.join(derivedDataDir(stateDir), 'Build', 'Products', `${CONFIGURATION}-iphonesimulator`);
    if (!fs.existsSync(products)) return null;
    const app = fs.readdirSync(products).find(name => name.endsWith('.app'));
    return app ? path.join(products, app) : null;
}

/**
 * Build with a private derived-data folder (a shared one lets another checkout's half-built
 * products leak in) and the Metro port as a build setting: React-Core compiles it in, so a Metro on
 * any other port answers "No script URL provided".
 */
async function build({ root, env, stateDir, udid, envFile, metroPort, logFile }) {
    const result = await runLogged(
        'xcodebuild',
        [
            '-workspace',
            path.join(root, IOS_DIR, 'Chatic.xcworkspace'),
            '-scheme',
            SCHEME,
            '-configuration',
            CONFIGURATION,
            '-sdk',
            'iphonesimulator',
            '-destination',
            `id=${udid}`,
            '-derivedDataPath',
            derivedDataDir(stateDir),
            `ENVFILE=${envFile}`,
            `RCT_METRO_PORT=${metroPort}`,
            'build',
        ],
        {
            cwd: root,
            env: { ...env, ENVFILE: envFile, RCT_METRO_PORT: String(metroPort) },
            logFile,
            timeoutMs: 60 * 60_000,
        }
    );
    const app = appPath(stateDir);
    if (result.status !== 0 || !app) {
        throw new EnvironmentError(`The iOS build failed (xcodebuild exit ${result.status}).`, [
            `Read the first "error:" in ${logFile}`,
            'An error in code this branch changed is a product bug; anything else is the environment.',
        ]);
    }
    return app;
}

function install(udid, app, env) {
    const result = simctl(['install', udid, app], env, 180_000);
    if (result.status !== 0) {
        throw new EnvironmentError(`Installing on ${udid} failed: ${result.stderr.trim()}`);
    }
}

/** The simulator's locale, e.g. `en_US`, or null when it cannot be read. */
function locale(udid, env) {
    return simctl(['spawn', udid, 'defaults', 'read', '-g', 'AppleLocale'], env, 20_000).stdout.trim() || null;
}

function launch(udid, env) {
    simctl(['terminate', udid, BUNDLE_ID], env);
    simctl(['launch', udid, BUNDLE_ID], env);
}

/** A fresh frame. The simulator-control screenshot can return a stale one; `simctl io` does not. */
function screenshot(udid, file, env) {
    return simctl(['io', udid, 'screenshot', '--type=png', file], env, 20_000).status === 0;
}

function startRecording(udid, file, env, logFile) {
    const recorder = startBackground('xcrun', ['simctl', 'io', udid, 'recordVideo', '--codec=h264', '--force', file], {
        env,
        logFile,
    });
    return {
        // recordVideo finalises the file only on SIGINT, and needs a moment to write it — the device
        // shutdown that follows in cleanup would otherwise cut the video short.
        stop: () => {
            recorder.stop('SIGINT');
            for (let i = 0; i < 25 && !recorder.exited(); i++) probe('/bin/sleep', ['0.2']);
        },
    };
}

function shutdown(udid, env) {
    simctl(['shutdown', udid], env);
}

module.exports = {
    SIM_NAME,
    BUNDLE_ID,
    APP_SCHEME,
    SCHEME,
    CONFIGURATION,
    ensureSimulator,
    bootSimulator,
    ensurePods,
    appPath,
    build,
    install,
    locale,
    launch,
    screenshot,
    startRecording,
    shutdown,
};
