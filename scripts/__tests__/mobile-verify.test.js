const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { parseArgs } = require('../mobile-verify/args');
const { formatProblems, EnvironmentError } = require('../mobile-verify/errors');
const { listScenarios, selectScenarios, findUnknownFeatures } = require('../mobile-verify/scenarios');
const { tryAcquireLock, releaseLock, findHeavyWork, busyFixes, isAlive } = require('../mobile-verify/machine');
const { redactLine } = require('../mobile-verify/proc');
const { nodeVersionWarning, isEnUs } = require('../mobile-verify/index');
const { pickPort, seedFrom } = require('../mobile-verify/ports');
const { parseEnv, deriveEnv } = require('../mobile-verify/envfile');
const { parseStatus, snapshot, restore, changedSince } = require('../mobile-verify/treeGuard');
const { buildFingerprint } = require('../mobile-verify/fingerprint');
const { javaMajor, pickIosRuntime, listSystemImages } = require('../mobile-verify/toolchain');
const { missingLocalFiles } = require('../mobile-verify/checkout');
const { parseInstalledVersionCode, avdConfig } = require('../mobile-verify/android');
const maestro = require('../mobile-verify/adapters/maestro');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-verify-'));

describe('mobile-verify', () => {
    describe('parseArgs', () => {
        it('reads a feature/scenario target and the platform', () => {
            const options = parseArgs(['home/open-room', '--platform', 'ios']);
            expect(options).toMatchObject({ target: 'home/open-room', platform: 'ios', web: 'local', waitMinutes: 15 });
        });

        it('accepts --tag instead of a target', () => {
            expect(parseArgs(['--tag', 'smoke', '--platform', 'android']).tag).toBe('smoke');
        });

        it('rejects a run without a platform, and one naming both a target and a tag', () => {
            expect(() => parseArgs(['home'])).toThrow('--platform must be ios or android');
            expect(() => parseArgs(['home', '--tag', 'smoke', '--platform', 'ios'])).toThrow('not both');
        });

        it('rejects unknown options and a flag missing its value', () => {
            expect(() => parseArgs(['home', '--platform', 'ios', '--fast'])).toThrow('Unknown option --fast');
            expect(() => parseArgs(['home', '--platform'])).toThrow('--platform needs a value');
        });

        it('lets --list and --help through without a target', () => {
            expect(parseArgs(['--list']).list).toBe(true);
            expect(parseArgs(['--help']).help).toBe(true);
        });
    });

    describe('formatProblems', () => {
        it('prints each problem with its fix lines', () => {
            const text = formatProblems([{ message: 'Missing a.env', fix: ['cp x a.env'] }]);
            expect(text).toContain('1. Missing a.env');
            expect(text).toContain('fix: cp x a.env');
        });

        it('EnvironmentError keeps a single fix as a one-entry list', () => {
            expect(new EnvironmentError('bad', 'do this').fix).toEqual(['do this']);
        });
    });

    describe('scenarios', () => {
        let root;
        beforeEach(() => {
            root = tempDir();
            const flows = path.join(root, 'apps/mobile/e2e/flows');
            fs.mkdirSync(path.join(flows, 'home'), { recursive: true });
            fs.mkdirSync(path.join(flows, '_shared'), { recursive: true });
            fs.mkdirSync(path.join(flows, 'chats'), { recursive: true });
            fs.mkdirSync(path.join(root, 'apps/web/src/app/features/home'), { recursive: true });
            fs.writeFileSync(path.join(flows, 'home/open-room.yaml'), 'appId: x\ntags: [smoke]\n---\n- launchApp\n');
            fs.writeFileSync(path.join(flows, 'home/notes.md'), 'not a flow');
            fs.writeFileSync(path.join(flows, '_shared/sign-in.yaml'), 'appId: x\n---\n');
        });

        it('lists flow files per feature with their tags, skipping shared sub-flows and other files', () => {
            const scenarios = listScenarios(root, maestro);
            expect(scenarios.map(s => [s.id, s.tags])).toEqual([['home/open-room', ['smoke']]]);
        });

        it('selects by feature, by feature/scenario and by tag', () => {
            const scenarios = listScenarios(root, maestro);
            expect(selectScenarios(scenarios, { target: 'home' })).toHaveLength(1);
            expect(selectScenarios(scenarios, { target: 'home/open-room' })).toHaveLength(1);
            expect(selectScenarios(scenarios, { tag: 'smoke' })).toHaveLength(1);
        });

        it('names the known scenarios when a selection matches nothing', () => {
            const scenarios = listScenarios(root, maestro);
            expect(() => selectScenarios(scenarios, { target: 'home/missing' })).toThrow(
                'Known scenarios: home/open-room'
            );
        });

        it('reports flow folders that name no web feature', () => {
            expect(findUnknownFeatures(root)).toEqual(['chats']);
        });

        it('finds no unknown feature folders in this repository', () => {
            expect(findUnknownFeatures(REPO_ROOT)).toEqual([]);
        });
    });

    describe('machine lock', () => {
        it('lets one holder in and keeps a second out while the first is alive', () => {
            const lockDir = path.join(tempDir(), 'lock');
            expect(tryAcquireLock({ pid: 1 }, { lockDir, alive: () => true }).acquired).toBe(true);
            const second = tryAcquireLock({ pid: 2 }, { lockDir, alive: () => true });
            expect(second).toEqual({ acquired: false, holder: { pid: 1 } });
        });

        it('takes over a lock whose holder is dead', () => {
            const lockDir = path.join(tempDir(), 'lock');
            tryAcquireLock({ pid: 1 }, { lockDir, alive: () => true });
            expect(tryAcquireLock({ pid: 2 }, { lockDir, alive: () => false }).acquired).toBe(true);
        });

        it('does not take a fresh lock another runner made after this one judged the old one stale', () => {
            const lockDir = path.join(tempDir(), 'lock');
            tryAcquireLock({ pid: 1 }, { lockDir, alive: () => true });
            // Runner 3 judges pid 1 dead, but runner 2 replaces the lock before 3 moves it.
            const alive = pid => {
                if (pid === 1) {
                    fs.rmSync(lockDir, { recursive: true });
                    tryAcquireLock({ pid: 2 }, { lockDir, alive: () => true });
                    return false;
                }
                return true;
            };
            expect(tryAcquireLock({ pid: 3 }, { lockDir, alive })).toEqual({ acquired: false, holder: { pid: 2 } });
            expect(JSON.parse(fs.readFileSync(path.join(lockDir, 'owner.json'), 'utf8')).pid).toBe(2);
        });

        it('treats a live pid that is not a device-verify run as a dead holder (pid reuse)', () => {
            const sleeper = require('child_process').spawn('sleep', ['30']);
            try {
                expect(isAlive(sleeper.pid)).toBe(false);
            } finally {
                sleeper.kill();
            }
            expect(isAlive(999999)).toBe(false);
        });

        it('releases only a lock this process holds', () => {
            const lockDir = path.join(tempDir(), 'lock');
            tryAcquireLock({ pid: 1 }, { lockDir, alive: () => true });
            releaseLock({ lockDir, pid: 2 });
            expect(fs.existsSync(lockDir)).toBe(true);
            releaseLock({ lockDir, pid: 1 });
            expect(fs.existsSync(lockDir)).toBe(false);
        });
    });

    describe('findHeavyWork', () => {
        const ps = [
            '  101 /Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild -workspace Chatic.xcworkspace',
            '  102 /usr/bin/java -classpath gradle-wrapper.jar org.gradle.wrapper.GradleWrapperMain app:assembleDevDebug',
            '  103 /sdk/emulator/qemu/darwin-aarch64/qemu-system-aarch64-headless -avd Probe_API35 -no-window',
            '  104 /sdk/emulator/qemu/darwin-aarch64/qemu-system-aarch64 -avd DoU_Verify -port 5600',
            '  105 /usr/bin/java org.gradle.launcher.daemon.bootstrap.GradleDaemon 8.14',
            '  106 /Applications/Xcode.app/Contents/SharedFrameworks/XCBuild.framework/XCBBuildService',
            '  107 /Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild test-without-building -xctestrun /tmp/driver.xctestrun',
        ].join('\n');

        it('finds builds and foreign emulators, ignoring idle daemons, UI-test drivers and the harness emulator', () => {
            const found = findHeavyWork(ps, { ownAvd: 'DoU_Verify', ownPid: 1 });
            expect(found.map(w => [w.pid, w.kind])).toEqual([
                [101, 'xcodebuild'],
                [102, 'gradle build'],
                [103, 'Android emulator (Probe_API35)'],
            ]);
        });

        it('treats the harness emulator as foreign on an iOS run', () => {
            expect(findHeavyWork(ps, { ownAvd: null, ownPid: 1 }).map(w => w.pid)).toContain(104);
        });
    });

    describe('busyFixes', () => {
        const build = { pid: 1, kind: 'xcodebuild' };
        const foreign = {
            pid: 2,
            kind: 'Android emulator (Probe_API35)',
            cwd: '/x',
            emulator: { avd: 'Probe_API35', serial: 'emulator-5582' },
        };
        const harness = {
            pid: 3,
            kind: 'Android emulator (DoU_Verify)',
            cwd: '/y',
            emulator: { avd: 'DoU_Verify', serial: 'emulator-5600' },
        };

        it('tells a build apart from an emulator, which never ends on its own', () => {
            const fixes = busyFixes([build, foreign], 'DoU_Verify');
            expect(fixes[0]).toContain('ends on its own');
            expect(fixes[1]).toContain('does not stop on its own');
            expect(fixes[1]).toContain('do not stop another session');
        });

        it('names a hand-check hold for what it is', () => {
            expect(busyFixes([{ pid: 4, kind: 'hold', hold: true }], 'DoU_Verify')).toEqual([
                expect.stringContaining('--app-only'),
            ]);
        });

        it("gives the exact stop command only for the harness's own emulator", () => {
            const fixes = busyFixes([harness], 'DoU_Verify');
            expect(fixes).toEqual([expect.stringContaining('adb -s emulator-5600 emu kill')]);
        });

        it('reads the serial out of the emulator command line', () => {
            const found = findHeavyWork('  9 /sdk/qemu-system-aarch64 -avd DoU_Verify -port 5600 -no-window', {
                ownPid: 1,
            });
            expect(found[0].emulator).toEqual({ avd: 'DoU_Verify', serial: 'emulator-5600' });
        });
    });

    describe('nodeVersionWarning', () => {
        it('stays quiet within the major .nvmrc names and speaks up across majors', () => {
            expect(nodeVersionWarning('v22.23.1', 'v22.15.1')).toBeNull();
            expect(nodeVersionWarning('v20.11.0', 'v22.15.1')).toContain('nvm use');
            expect(nodeVersionWarning('v22.1.0', null)).toBeNull();
        });
    });

    describe('redactLine', () => {
        it('hides the env react-native-config prints into the build log, and nothing else', () => {
            expect(redactLine('read dotenv {"VITE_ENV"=>"LOCAL", "KEY"=>"secret"}')).toBe(
                'read dotenv <redacted by the device-verify runner>'
            );
            expect(redactLine('** BUILD SUCCEEDED **')).toBe('** BUILD SUCCEEDED **');
        });
    });

    describe('isEnUs', () => {
        it("accepts both platforms' spellings of en-US and nothing else", () => {
            expect(isEnUs('en_US')).toBe(true);
            expect(isEnUs('en-US')).toBe(true);
            expect(isEnUs('ko-KR')).toBe(false);
            expect(isEnUs('en_GB')).toBe(false);
        });
    });

    describe('pickPort', () => {
        it('keeps the remembered port while it is free', async () => {
            expect(await pickPort({ preferred: 5150, range: [5100, 5199], isFree: async () => true })).toBe(5150);
        });

        it('falls back to the first free port from the seed, wrapping round the range', async () => {
            const taken = new Set([5150, 5198, 5199]);
            const port = await pickPort({
                preferred: 5150,
                range: [5100, 5199],
                seed: 98,
                isFree: async p => !taken.has(p),
            });
            expect(port).toBe(5100);
        });

        it('returns null when the whole range is taken', async () => {
            expect(await pickPort({ range: [5100, 5101], isFree: async () => false })).toBeNull();
        });

        it('derives the same seed for the same checkout', () => {
            expect(seedFrom('/a/b')).toBe(seedFrom('/a/b'));
            expect(seedFrom('/a/b')).toBeLessThan(100);
        });
    });

    describe('env file', () => {
        it('parses KEY=VALUE lines, quotes and export, skipping comments', () => {
            const values = parseEnv('# c\nexport A="1"\nB=two\n\nC=\n');
            expect([...values]).toEqual([
                ['A', '1'],
                ['B', 'two'],
                ['C', ''],
            ]);
        });

        it('--web local: dev values, overlaid by non-empty local ones, web URL pointed at the harness port', () => {
            const merged = deriveEnv({
                devText: 'VITE_ENV=DEV\nVITE_WEBVIEW_BASE_URL=https://dev.example\nVITE_GOOGLE_WEB_CLIENT_ID=dev-id\n',
                localText: 'VITE_ENV=LOCAL\nVITE_WEBVIEW_BASE_URL=http://localhost:5003\nVITE_GOOGLE_WEB_CLIENT_ID=\n',
                web: 'local',
                webUrl: 'http://localhost:5150',
            });
            expect(merged.get('VITE_ENV')).toBe('LOCAL');
            expect(merged.get('VITE_GOOGLE_WEB_CLIENT_ID')).toBe('dev-id');
            expect(merged.get('VITE_WEBVIEW_BASE_URL')).toBe('http://localhost:5150');
        });

        it('--web dev: the dev env unchanged', () => {
            const merged = deriveEnv({
                devText: 'VITE_WEBVIEW_BASE_URL=https://dev.example\n',
                localText: 'VITE_WEBVIEW_BASE_URL=http://localhost:5003\n',
                web: 'dev',
                webUrl: 'http://localhost:5150',
            });
            expect(merged.get('VITE_WEBVIEW_BASE_URL')).toBe('https://dev.example');
        });
    });

    describe('tree guard', () => {
        it('splits porcelain -z output into changed and untracked, skipping rename sources', () => {
            const output = [
                ' M apps/mobile/package.json',
                '?? apps/mobile/ios/Gemfile.lock',
                'R  new.js',
                'old.js',
                '',
            ].join('\0');
            const { changed, untracked } = parseStatus(output);
            expect([...changed]).toEqual(['apps/mobile/package.json', 'new.js']);
            expect([...untracked]).toEqual(['apps/mobile/ios/Gemfile.lock']);
        });
    });

    describe('tree guard restore', () => {
        let root;
        const write = (file, text) => {
            fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
            fs.writeFileSync(path.join(root, file), text);
        };
        const read = file => fs.readFileSync(path.join(root, file), 'utf8');
        beforeEach(() => {
            root = tempDir();
            const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
            git('init', '-q');
            write('apps/mobile/ios/Podfile.lock', 'committed\n');
            write('apps/mobile/ios/Chatic.xcodeproj/project.pbxproj', 'committed pbxproj\n');
            git('add', '.');
            git('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-qm', 'init');
        });

        it('writes back the bytes from before the build, keeping an uncommitted edit made before it', () => {
            write('apps/mobile/ios/Chatic.xcodeproj/project.pbxproj', 'an edit of my own\n');
            const before = snapshot(root);
            write('apps/mobile/ios/Podfile.lock', 'rewritten by pod install\n');
            write('apps/mobile/ios/Chatic.xcodeproj/project.pbxproj', 'rewritten by pod install\n');
            expect(restore(root, before).sort()).toEqual([
                'apps/mobile/ios/Chatic.xcodeproj/project.pbxproj',
                'apps/mobile/ios/Podfile.lock',
            ]);
            expect(read('apps/mobile/ios/Podfile.lock')).toBe('committed\n');
            expect(read('apps/mobile/ios/Chatic.xcodeproj/project.pbxproj')).toBe('an edit of my own\n');
        });

        it('never deletes a file created during the run, and reports it', () => {
            const before = snapshot(root);
            write('apps/mobile/e2e/flows/home/new-scenario.yaml', 'appId: x\n');
            restore(root, before);
            expect(fs.existsSync(path.join(root, 'apps/mobile/e2e/flows/home/new-scenario.yaml'))).toBe(true);
            expect(changedSince(root, before)).toEqual(['apps/mobile/e2e/flows/home/new-scenario.yaml']);
        });
    });

    describe('buildFingerprint', () => {
        const base = { platform: 'ios', sourceState: ['tree', ''], inputFiles: [], settings: { metroPort: 8100 } };

        it('is stable for the same inputs', () => {
            expect(buildFingerprint(base)).toBe(buildFingerprint({ ...base }));
        });

        it('changes with the native sources, the Metro port and the platform', () => {
            const fingerprint = buildFingerprint(base);
            expect(buildFingerprint({ ...base, sourceState: ['tree', 'diff'] })).not.toBe(fingerprint);
            expect(buildFingerprint({ ...base, settings: { metroPort: 8101 } })).not.toBe(fingerprint);
            expect(buildFingerprint({ ...base, platform: 'android' })).not.toBe(fingerprint);
        });

        it('changes with the content of an input file', () => {
            const file = path.join(tempDir(), 'build.env');
            fs.writeFileSync(file, 'A=1\n');
            const first = buildFingerprint({ ...base, inputFiles: [file] });
            fs.writeFileSync(file, 'A=2\n');
            expect(buildFingerprint({ ...base, inputFiles: [file] })).not.toBe(first);
        });
    });

    describe('toolchain parsing', () => {
        it('reads the Java major version from both version schemes', () => {
            expect(javaMajor('openjdk version "21.0.3" 2024-04-16')).toBe(21);
            expect(javaMajor('java version "1.8.0_292"')).toBe(8);
            expect(javaMajor('')).toBeNull();
        });

        it('picks the newest available iOS runtime of the wanted major', () => {
            const runtimes = {
                runtimes: [
                    { platform: 'iOS', version: '18.3', isAvailable: true, identifier: 'r18' },
                    { platform: 'iOS', version: '26.0', isAvailable: true, identifier: 'r260' },
                    { platform: 'iOS', version: '26.3', isAvailable: true, identifier: 'r263' },
                    { platform: 'iOS', version: '26.4', isAvailable: false, identifier: 'r264' },
                ],
            };
            expect(pickIosRuntime(runtimes).identifier).toBe('r263');
            expect(pickIosRuntime({ runtimes: [] })).toBeNull();
        });

        it('lists arm64 google_apis images at API 29+, newest first', () => {
            const sdk = tempDir();
            for (const dir of [
                'android-28/google_apis/arm64-v8a',
                'android-30/google_apis_playstore/arm64-v8a',
                'android-35/google_apis/arm64-v8a',
                'android-34-ext9/android-automotive/arm64-v8a',
            ]) {
                fs.mkdirSync(path.join(sdk, 'system-images', dir), { recursive: true });
            }
            expect(listSystemImages(sdk).map(i => i.api)).toEqual([35, 30]);
        });
    });

    describe('missingLocalFiles', () => {
        let root;
        let main;
        beforeEach(() => {
            root = tempDir();
            main = tempDir();
            fs.mkdirSync(path.join(main, 'apps/mobile'), { recursive: true });
            fs.writeFileSync(path.join(main, 'apps/mobile/.env'), 'secret');
        });

        it('in a worktree, spells out the copy from the main checkout without printing contents', () => {
            const problems = missingLocalFiles({ root, platform: 'ios', web: 'local', mainCheckout: main });
            const env = problems.find(p => p.message.startsWith('Missing apps/mobile/.env —'));
            expect(env.fix[0]).toBe(
                `mkdir -p "apps/mobile" && cp "${path.join(main, 'apps/mobile/.env')}" "apps/mobile/.env"`
            );
            expect(JSON.stringify(problems)).not.toContain('secret');
        });

        it('asks only for the files the platform and web mode need', () => {
            const files = missingLocalFiles({ root, platform: 'android', web: 'dev', mainCheckout: null }).map(
                p => p.message.split(' ')[1]
            );
            expect(files).toEqual([
                'apps/mobile/.env',
                'apps/mobile/.env.dev',
                'apps/mobile/android/app/src/dev/google-services.json',
            ]);
        });
    });

    describe('android', () => {
        it('reads the installed versionCode, or null when the app is not installed', () => {
            expect(parseInstalledVersionCode('    versionCode=82 minSdk=24 targetSdk=35')).toBe(82);
            expect(parseInstalledVersionCode('Unable to find package')).toBeNull();
        });

        it('writes an AVD config for the image it is given', () => {
            const config = avdConfig({
                dir: 'system-images/android-35/google_apis/arm64-v8a/',
                tag: 'google_apis',
                api: 35,
            });
            expect(config).toContain('image.sysdir.1=system-images/android-35/google_apis/arm64-v8a/');
            expect(config).toContain('PlayStore.enabled=no');
        });
    });

    describe('maestro adapter', () => {
        it('reads tags inline or as a list, and none when absent', () => {
            expect(maestro.readMeta('appId: x\ntags: [smoke, "home"]\n---\n').tags).toEqual(['smoke', 'home']);
            expect(maestro.readMeta('appId: x\ntags:\n  - smoke\n  - slow\n---\n- launchApp\n').tags).toEqual([
                'smoke',
                'slow',
            ]);
            expect(maestro.readMeta('appId: x\n---\n- launchApp\n').tags).toEqual([]);
        });

        it('ignores a tags key that appears after the config block', () => {
            expect(maestro.readMeta('appId: x\n---\n- evalScript: "tags: [smoke]"\n').tags).toEqual([]);
        });

        it('tells a tool failure apart from a failed step', () => {
            const isToolFailure = line => maestro.TOOL_FAILURE_PATTERNS.some(p => p.test(line));
            expect(isToolFailure('Device 1234-ABCD was not found')).toBe(true);
            expect(isToolFailure('Assert that "Self Chat" is visible... FAILED')).toBe(false);
        });

        it('lifts nested checkpoints to the top of the scenario folder', () => {
            const dir = tempDir();
            const nested = path.join(dir, '2026-10-12_105634', 'Cold boot', 'takeScreenshot');
            fs.mkdirSync(nested, { recursive: true });
            fs.writeFileSync(path.join(nested, 'checkpoint-home.png'), 'png');
            expect(maestro.liftCheckpoints(dir)).toEqual([path.join(dir, 'checkpoint-home.png')]);
            expect(fs.readFileSync(path.join(dir, 'checkpoint-home.png'), 'utf8')).toBe('png');
        });

        it('collects checkpoint screenshots and nothing else', () => {
            const dir = tempDir();
            fs.mkdirSync(path.join(dir, 'nested'));
            fs.writeFileSync(path.join(dir, 'checkpoint-home.png'), '');
            fs.writeFileSync(path.join(dir, 'nested', 'checkpoint-room.png'), '');
            fs.writeFileSync(path.join(dir, 'final.png'), '');
            expect(
                maestro
                    .collectCheckpoints(dir)
                    .map(f => path.basename(f))
                    .sort()
            ).toEqual(['checkpoint-home.png', 'checkpoint-room.png']);
        });
    });
});
