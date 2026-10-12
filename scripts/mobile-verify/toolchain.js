/**
 * The process environment every child of the runner gets, and the toolchain checks behind it.
 *
 * An agent's shell is not the developer's interactive shell: it does not source the shell profile,
 * so it has neither a UTF-8 locale (CocoaPods then dies with "Unicode Normalization not appropriate
 * for ASCII-8BIT", and xcpretty crashes mid-build) nor `ANDROID_HOME` (Gradle: "SDK location not
 * found"). The runner sets both itself rather than asking every caller to remember them.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const { probe } = require('./proc');

const IOS_RUNTIME_MAJOR = 26;
const IOS_DEVICE_TYPE = 'iPhone 17 Pro';
const MIN_ANDROID_API = 29;
const MIN_JAVA = 17;

function defaultAndroidHome(env = process.env) {
    return env.ANDROID_HOME || env.ANDROID_SDK_ROOT || path.join(os.homedir(), 'Library', 'Android', 'sdk');
}

/**
 * Environment for child processes. `TMPDIR` is private to the checkout because
 * react-native-static-server keeps a CMake cache in `$TMPDIR/rnss-build-…`, and another checkout's
 * cache there fails the build with "source does not match the source used to generate cache";
 * Metro's cache lives under the temp dir too.
 */
function buildChildEnv({ stateDir, base = process.env }) {
    const androidHome = defaultAndroidHome(base);
    const tmpDir = path.join(stateDir, 'tmp');
    fs.mkdirSync(tmpDir, { recursive: true });
    return {
        ...base,
        LANG: 'en_US.UTF-8',
        LC_ALL: 'en_US.UTF-8',
        ANDROID_HOME: androidHome,
        PATH: [path.join(androidHome, 'platform-tools'), path.join(androidHome, 'emulator'), base.PATH].join(':'),
        TMPDIR: `${tmpDir}/`,
        NX_DAEMON: 'false',
    };
}

/** Parse the major version out of `java -version` output ("21.0.3", "1.8.0_292" → 8). */
function javaMajor(versionOutput) {
    const match = versionOutput.match(/version "(\d+)(?:\.(\d+))?/);
    if (!match) return null;
    const first = Number(match[1]);
    return first === 1 ? Number(match[2]) : first;
}

/** The newest available iOS runtime with the wanted major, from `simctl list runtimes -j`. */
function pickIosRuntime(runtimesJson, major = IOS_RUNTIME_MAJOR) {
    const runtimes = (runtimesJson.runtimes ?? []).filter(
        r => r.isAvailable && r.platform === 'iOS' && Number(r.version.split('.')[0]) === major
    );
    runtimes.sort((a, b) => compareVersions(b.version, a.version));
    return runtimes[0] ?? null;
}

function compareVersions(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (diff !== 0) return diff;
    }
    return 0;
}

/** Problems that stop an iOS run, each with its fix. */
function checkIosToolchain(env) {
    const problems = [];
    const developerDir = probe('xcode-select', ['-p'], { env }).stdout.trim();
    if (!developerDir.includes('.app/Contents/Developer')) {
        problems.push({
            message: `xcode-select points at "${developerDir || 'nothing'}", not an Xcode app.`,
            fix: ['Install Xcode, then: sudo xcode-select -s /Applications/Xcode.app (needs your password)'],
        });
        return problems;
    }
    if (probe('xcodebuild', ['-version'], { env }).status !== 0) {
        problems.push({
            message: 'xcodebuild does not run (license not accepted, or first launch not finished).',
            fix: ['sudo xcodebuild -license accept && xcodebuild -runFirstLaunch'],
        });
    }
    const runtimes = probe('xcrun', ['simctl', 'list', 'runtimes', '-j'], { env });
    const runtime = runtimes.status === 0 ? pickIosRuntime(JSON.parse(runtimes.stdout)) : null;
    if (!runtime) {
        problems.push({
            message: `No iOS ${IOS_RUNTIME_MAJOR}.x simulator runtime is installed (the app's deployment target needs it).`,
            fix: [`xcodebuild -downloadPlatform iOS   (or Xcode → Settings → Components)`],
        });
    }
    const types = probe('xcrun', ['simctl', 'list', 'devicetypes', '-j'], { env });
    if (types.status === 0 && !JSON.parse(types.stdout).devicetypes.some(t => t.name === IOS_DEVICE_TYPE)) {
        problems.push({
            message: `This Xcode has no "${IOS_DEVICE_TYPE}" simulator device type.`,
            fix: ['Update Xcode to a version that ships it.'],
        });
    }
    // react-native-config's iOS script reads /tmp/envfile before ENVFILE: a leftover one (an old scheme
    // pre-action wrote it) silently replaces the harness env, web URL included.
    if (fs.existsSync('/tmp/envfile')) {
        problems.push({
            message: '/tmp/envfile exists; react-native-config would read it instead of the harness env.',
            fix: ['rm /tmp/envfile   (scripts/deploy-mobile.sh refuses to run with it for the same reason)'],
        });
    }
    if (probe('pod', ['--version'], { env }).status !== 0) {
        problems.push({ message: 'CocoaPods (`pod`) is not on PATH.', fix: ['gem install cocoapods'] });
    }
    return problems;
}

/** Installed system images at or above the minimum API, newest first: [{ api, dir, tag }]. */
function listSystemImages(androidHome) {
    const root = path.join(androidHome, 'system-images');
    if (!fs.existsSync(root)) return [];
    const images = [];
    for (const platform of fs.readdirSync(root)) {
        const api = Number(platform.match(/^android-(\d+)$/)?.[1]);
        if (!api || api < MIN_ANDROID_API) continue;
        for (const tag of fs.readdirSync(path.join(root, platform))) {
            if (!/^google_apis(_playstore)?$/.test(tag)) continue;
            const abiDir = path.join(root, platform, tag, 'arm64-v8a');
            if (fs.existsSync(abiDir)) images.push({ api, tag, dir: `system-images/${platform}/${tag}/arm64-v8a/` });
        }
    }
    return images.sort((a, b) => b.api - a.api);
}

/** Problems that stop an Android run, each with its fix. */
function checkAndroidToolchain(env) {
    const problems = [];
    const androidHome = env.ANDROID_HOME;
    if (!fs.existsSync(path.join(androidHome, 'platform-tools', 'adb'))) {
        problems.push({
            message: `No Android SDK at ${androidHome} (ANDROID_HOME, or the default location).`,
            fix: ['Install Android Studio and its SDK, or export ANDROID_HOME=<your SDK path> before running.'],
        });
        return problems;
    }
    if (!fs.existsSync(path.join(androidHome, 'emulator', 'emulator'))) {
        problems.push({
            message: 'The Android Emulator package is not installed.',
            fix: ['Android Studio → SDK Manager → SDK Tools → Android Emulator'],
        });
    }
    const java = probe('java', ['-version'], { env });
    const major = javaMajor(`${java.stdout}${java.stderr}`);
    if (!major || major < MIN_JAVA) {
        problems.push({
            message: `Gradle needs JDK ${MIN_JAVA}+; java on PATH is ${major ?? 'missing'}.`,
            fix: [`Install a JDK ${MIN_JAVA}, then export JAVA_HOME=$(/usr/libexec/java_home -v ${MIN_JAVA})`],
        });
    }
    if (!env.DOU_VERIFY_AVD && listSystemImages(androidHome).length === 0) {
        problems.push({
            message: `No arm64 google_apis system image at API ${MIN_ANDROID_API}+ to create the harness emulator from (API 28 ships a WebView too old for apps/web).`,
            fix: [
                'Android Studio → SDK Manager → SDK Platforms → show package details → a "Google APIs ARM 64 v8a System Image" for API 35',
                'or export DOU_VERIFY_AVD=<an existing AVD at API 29+>',
            ],
        });
    }
    return problems;
}

module.exports = {
    IOS_DEVICE_TYPE,
    MIN_ANDROID_API,
    buildChildEnv,
    defaultAndroidHome,
    javaMajor,
    pickIosRuntime,
    compareVersions,
    listSystemImages,
    checkIosToolchain,
    checkAndroidToolchain,
};
