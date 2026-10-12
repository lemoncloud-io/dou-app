/**
 * Android emulator: the harness's own AVD, the devDebug build, install, port forwarding.
 *
 * The harness owns an AVD (`DoU_Verify`, or the one `DOU_VERIFY_AVD` names) and addresses it by its
 * serial on every adb call — other sessions keep their own emulators connected, and an adb command
 * without a serial fails or, worse, lands on theirs. The build is a plain Gradle `assembleDevDebug`
 * plus `adb -s <serial> install` rather than `react-native run-android`, which installs on every
 * connected device when it is not told otherwise.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const { EnvironmentError } = require('./errors');
const { spawnSync } = require('child_process');

const { probe, runLogged, startBackground, waitFor, tail } = require('./proc');
const { isPortFree } = require('./ports');
const { listSystemImages } = require('./toolchain');

const DEFAULT_AVD = 'DoU_Verify';
const APP_ID = 'io.chatic.dou.dev';
const APP_SCHEME = 'chatic-dev';
const ANDROID_DIR = 'apps/mobile/android';
const APK = 'app/build/outputs/apk/dev/debug/app-dev-debug.apk';

const avdName = env => env.DOU_VERIFY_AVD || DEFAULT_AVD;

function adb(serial, args, env, timeoutMs = 60_000) {
    return probe('adb', ['-s', serial, ...args], { env, timeoutMs });
}

/** `config.ini` for the harness AVD: a Pixel-sized phone with a soft keyboard that shows up. */
function avdConfig(image) {
    return [
        `AvdId=${DEFAULT_AVD}`,
        `avd.ini.displayname=DoU Verify`,
        `abi.type=arm64-v8a`,
        `hw.cpu.arch=arm64`,
        `image.sysdir.1=${image.dir}`,
        `tag.id=${image.tag}`,
        `PlayStore.enabled=${image.tag === 'google_apis_playstore' ? 'yes' : 'no'}`,
        `hw.lcd.width=1080`,
        `hw.lcd.height=2400`,
        `hw.lcd.density=420`,
        `hw.ramSize=4096`,
        `disk.dataPartition.size=6G`,
        `hw.keyboard=yes`,
        `hw.gpu.enabled=yes`,
        `hw.gpu.mode=auto`,
        `fastboot.forceColdBoot=yes`,
        '',
    ].join('\n');
}

/**
 * Make sure the AVD exists. The harness writes its own from the newest installed system image
 * (API 29 or later: API 28 ships a WebView too old to run apps/web) instead of calling `avdmanager`,
 * which only exists when the separate command-line tools package is installed.
 */
function ensureAvd(env, log) {
    const name = avdName(env);
    const avdHome = env.ANDROID_AVD_HOME || path.join(os.homedir(), '.android', 'avd');
    if (fs.existsSync(path.join(avdHome, `${name}.ini`))) return name;
    if (name !== DEFAULT_AVD) {
        throw new EnvironmentError(`DOU_VERIFY_AVD names "${name}", which is not in ${avdHome}.`, [
            'emulator -list-avds   (pick one at API 29+), or unset DOU_VERIFY_AVD',
        ]);
    }
    const image = listSystemImages(env.ANDROID_HOME)[0];
    log(`Creating the harness emulator "${name}" from ${image.dir}.`);
    const avdDir = path.join(avdHome, `${name}.avd`);
    fs.mkdirSync(avdDir, { recursive: true });
    fs.writeFileSync(path.join(avdDir, 'config.ini'), avdConfig(image));
    fs.writeFileSync(
        path.join(avdHome, `${name}.ini`),
        `avd.ini.encoding=UTF-8\npath=${avdDir}\npath.rel=avd/${name}.avd\ntarget=android-${image.api}\n`
    );
    return name;
}

/** The serial of an emulator already running this AVD (left by --keep-device), or null. */
function findRunningSerial(name, env) {
    const devices = probe('adb', ['devices'], { env }).stdout;
    for (const serial of devices.match(/^emulator-\d+(?=\s+device)/gm) ?? []) {
        const running = adb(serial, ['emu', 'avd', 'name'], env, 10_000).stdout.split('\n')[0].trim();
        if (running === name) return serial;
    }
    return null;
}

/** Boot the AVD (or adopt it when already running) and wait for Android to finish starting. */
/**
 * `onStarted(serial)` runs as soon as the emulator process is launched or adopted, before the wait
 * — the caller registers its shutdown there, so a boot that times out or is interrupted does not
 * leave an emulator running.
 */
async function bootEmulator({ env, name, show, logFile, onStarted = () => undefined }) {
    // Only the harness's own AVD is adopted when it is already running; an AVD named by
    // DOU_VERIFY_AVD may be someone's emulator in use, and the machine scan waits for it instead.
    let serial = name === DEFAULT_AVD ? findRunningSerial(name, env) : null;
    let started = false;
    let emulator = null;
    if (!serial) {
        let consolePort = null;
        for (let port = 5600; port <= 5680 && !consolePort; port += 2) {
            if ((await isPortFree(port)) && (await isPortFree(port + 1))) consolePort = port;
        }
        if (!consolePort) throw new EnvironmentError('No free emulator console port in 5600–5680.');
        const args = ['-avd', name, '-port', String(consolePort), '-no-snapshot-save', '-no-audio', '-no-boot-anim'];
        if (!show) args.push('-no-window');
        emulator = startBackground(path.join(env.ANDROID_HOME, 'emulator', 'emulator'), args, { env, logFile });
        serial = `emulator-${consolePort}`;
        started = true;
    }
    onStarted(serial);
    const booted = await waitFor(
        () => adb(serial, ['shell', 'getprop', 'sys.boot_completed'], env, 10_000).stdout.trim() === '1',
        {
            timeoutMs: 10 * 60_000,
            intervalMs: 3000,
            // An emulator that exits at once ("another emulator instance running with the current
            // AVD") would otherwise be noticed only after the whole wait.
            abort: () => Boolean(emulator?.exited()),
        }
    );
    if (!booted && emulator?.exited()) {
        throw new EnvironmentError(`The emulator ${name} exited while starting:\n${tail(logFile, 8)}`, [
            `Read ${logFile}`,
        ]);
    }
    if (!booted) {
        throw new EnvironmentError(`The emulator ${name} (${serial}) did not finish booting in 10 minutes.`, [
            `Read ${logFile}`,
            'On a loaded machine (another emulator, a build) a cold boot can take this long: run again when it is quieter.',
            `A GPU init failure there ("Failed to restore previous context") goes away with: emulator -avd ${name} -gpu swiftshader_indirect`,
        ]);
    }
    // The emulator reports a hardware keyboard, which hides the soft keyboard a scenario may need to see.
    adb(serial, ['shell', 'settings', 'put', 'secure', 'show_ime_with_hard_keyboard', '1'], env);
    // On a loaded machine a cold-booted emulator's System UI stalls, and its "isn't responding" dialog
    // covers the app until someone taps Wait — a scenario then fails on the dialog, not the app. The
    // AVD is the harness's own, so its error dialogs are hidden; an app that crashes still fails the
    // scenario, because the app is gone.
    adb(serial, ['shell', 'settings', 'put', 'global', 'hide_error_dialogs', '1'], env);
    return { serial, started };
}

/** versionCode in build.gradle, and the installed one on the device (null when not installed). */
function readVersionCode(root) {
    const gradle = fs.readFileSync(path.join(root, ANDROID_DIR, 'app', 'build.gradle'), 'utf8');
    return Number(gradle.match(/versionCode\s+(\d+)/)[1]);
}

function parseInstalledVersionCode(dumpsysOutput) {
    const match = dumpsysOutput.match(/versionCode=(\d+)/);
    return match ? Number(match[1]) : null;
}

/**
 * Build the devDebug APK. The Metro port goes in as `reactNativeDevServerPort` (the app's
 * `react_native_dev_server_port` resource); one ABI is enough for the emulator and halves the build.
 */
async function build({ root, env, stateDir, envFile, metroPort, logFile }) {
    const androidDir = path.join(root, ANDROID_DIR);
    const result = await runLogged(
        './gradlew',
        ['app:assembleDevDebug', `-PreactNativeDevServerPort=${metroPort}`, '-PreactNativeArchitectures=arm64-v8a'],
        { cwd: androidDir, env: { ...env, ENVFILE: envFile }, logFile, timeoutMs: 60 * 60_000 }
    );
    const apk = path.join(androidDir, APK);
    if (result.status !== 0 || !fs.existsSync(apk)) {
        throw new EnvironmentError(`The Android build failed (gradle exit ${result.status}).`, [
            `Read the first "FAILURE" / "error:" in ${logFile}`,
            'An error in code this branch changed is a product bug; anything else is the environment.',
        ]);
    }
    // Gradle writes where every devDebug build writes, `yarn mobile:android:dev` included; the copy
    // the harness installs from is its own, so a build for other ports in between is never reused.
    const own = harnessApk(stateDir);
    fs.copyFileSync(apk, own);
    return own;
}

function harnessApk(stateDir) {
    return path.join(stateDir, 'app-dev-debug.apk');
}

/**
 * Install, guarding against INSTALL_FAILED_VERSION_DOWNGRADE: the harness AVD is shared by every
 * checkout, and one on an older branch has a lower versionCode than what the last run installed.
 * The app's data goes with the uninstall, which scenarios do not rely on — they clear state anyway.
 */
function install({ root, serial, apk, env, log }) {
    const installed = parseInstalledVersionCode(adb(serial, ['shell', 'dumpsys', 'package', APP_ID], env).stdout);
    const ours = readVersionCode(root);
    if (installed !== null && installed > ours) {
        log(`The emulator has versionCode ${installed}, this checkout builds ${ours}; uninstalling first.`);
        adb(serial, ['uninstall', APP_ID], env);
    }
    let result = adb(serial, ['install', '-r', apk], env, 300_000);
    if (
        result.status !== 0 &&
        /INSTALL_FAILED_(UPDATE_INCOMPATIBLE|VERSION_DOWNGRADE)/.test(result.stdout + result.stderr)
    ) {
        adb(serial, ['uninstall', APP_ID], env);
        result = adb(serial, ['install', apk], env, 300_000);
    }
    if (result.status !== 0) {
        throw new EnvironmentError(`Installing on ${serial} failed: ${(result.stdout + result.stderr).trim()}`);
    }
}

/**
 * The emulator's own `localhost` is not the host's. The web URL baked into the build says
 * `localhost:<web port>`, so that port is reversed; the Metro port too, which covers both ways RN
 * resolves its packager host on an emulator (`10.0.2.2` or `localhost`).
 */
function forwardPorts(serial, ports, env) {
    for (const port of ports) adb(serial, ['reverse', `tcp:${port}`, `tcp:${port}`], env);
}

/** The emulator's locale, e.g. `en-US`, or null when it cannot be read. */
function locale(serial, env) {
    const read = prop => adb(serial, ['shell', 'getprop', prop], env, 10_000).stdout.trim();
    return read('persist.sys.locale') || read('ro.product.locale') || null;
}

/** The dev flavor's launcher activity is the `DefaultIcon` alias (the app switches icons through aliases). */
function launch(serial, env) {
    adb(serial, ['shell', 'am', 'force-stop', APP_ID], env);
    adb(serial, ['shell', 'am', 'start', '-n', `${APP_ID}/io.chatic.dou.DefaultIcon`], env);
}

function screenshot(serial, file, env) {
    const fd = fs.openSync(file, 'w');
    const result = spawnSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], {
        env,
        stdio: ['ignore', fd, 'ignore'],
        timeout: 20_000,
    });
    fs.closeSync(fd);
    return result.status === 0 && fs.statSync(file).size > 0;
}

/** screenrecord stops on its own at 180 s, the most it allows; pulled when the run ends. */
function startRecording(serial, file, env, logFile) {
    const remote = '/sdcard/dou-verify.mp4';
    const recorder = startBackground('adb', ['-s', serial, 'shell', 'screenrecord', '--time-limit', '180', remote], {
        env,
        logFile,
    });
    return {
        // Interrupt the recorder on the device first, so it finalises the file; stopping the local
        // adb client first can hang it up before it writes the end of the video.
        stop: () => {
            adb(serial, ['shell', 'pkill', '-INT', 'screenrecord'], env);
            probe('/bin/sleep', ['2']);
            recorder.stop();
            adb(serial, ['pull', remote, file], env);
        },
    };
}

function shutdown(serial, env) {
    adb(serial, ['emu', 'kill'], env);
}

module.exports = {
    DEFAULT_AVD,
    APP_ID,
    APP_SCHEME,
    avdName,
    avdConfig,
    ensureAvd,
    bootEmulator,
    readVersionCode,
    parseInstalledVersionCode,
    build,
    harnessApk,
    install,
    forwardPorts,
    locale,
    launch,
    screenshot,
    startRecording,
    shutdown,
};
