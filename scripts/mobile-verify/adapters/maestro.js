/**
 * Maestro: YAML flows, one per scenario. Chosen for the harness because a flow is readable by
 * someone who has never seen the tool, needs no project of its own (no npm package, no WebDriver
 * server), and reaches text inside the app's WebView through the platform accessibility tree on
 * both iOS and Android.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const { EnvironmentError } = require('../errors');
const { probe, runLogged, tail } = require('../proc');
const { javaMajor } = require('../toolchain');

/** The version the flows are written against. A different one runs, with a warning. */
const MAESTRO_VERSION = '2.11.0';
const INSTALL_DIR = path.join(os.homedir(), '.maestro', 'bin');

/**
 * Lines in Maestro's output that mean the tool could not drive the device — the app was never
 * exercised, so the run says "could not run" (exit 2) and not "failed" (exit 1).
 */
const TOOL_FAILURE_PATTERNS = [
    /Device .* (was )?not found/i,
    /No (connected )?devices? found/i,
    /Failed to (connect|start|install) .*driver/i,
    /IOSDriverTimeoutException|XCTestDriver.*(failed|timed out)/i,
    /Maestro Android driver did not start/i,
    /Unable to (open|connect to) (the )?(device|simulator)/i,
];

function maestroBinary(env) {
    const onPath = probe('/bin/sh', ['-c', 'command -v maestro'], { env }).stdout.trim();
    if (onPath) return onPath;
    const installed = path.join(INSTALL_DIR, 'maestro');
    return fs.existsSync(installed) ? installed : null;
}

/** Tags from a flow's config block (the part before the first `---`), inline or as a list. */
function readMeta(text) {
    const header = text.split(/^---\s*$/m)[0];
    const inline = header.match(/^tags:\s*\[(.*)\]\s*$/m);
    if (inline) {
        return {
            tags: inline[1]
                .split(',')
                .map(t => t.trim().replace(/^['"]|['"]$/g, ''))
                .filter(Boolean),
        };
    }
    const block = header.match(/^tags:\s*\n((?:\s+-\s*.+\n?)+)/m);
    if (block) {
        return {
            tags: block[1]
                .split('\n')
                .map(line => line.replace(/^\s*-\s*/, '').trim())
                .filter(Boolean),
        };
    }
    return { tags: [] };
}

function installFix() {
    return [
        `Install Maestro ${MAESTRO_VERSION} from its own installer (the Homebrew formula named "maestro" is an unrelated app):`,
        `curl -fsSL "https://get.maestro.mobile.dev" | MAESTRO_VERSION=${MAESTRO_VERSION} bash`,
        'It installs to ~/.maestro/bin, which the runner finds without a PATH change.',
    ];
}

function preflight(env) {
    const problems = [];
    const java = probe('java', ['-version'], { env });
    const major = javaMajor(`${java.stdout}${java.stderr}`);
    if (!major || major < 17) {
        problems.push({
            message: `Maestro needs Java 17+; java on PATH is ${major ?? 'missing'}.`,
            fix: ['Install a JDK 17+, then export JAVA_HOME=$(/usr/libexec/java_home -v 17)'],
        });
    }
    const binary = maestroBinary(env);
    if (!binary) {
        problems.push({ message: 'Maestro is not installed.', fix: installFix() });
    }
    return problems;
}

function versionWarning(env) {
    const binary = maestroBinary(env);
    const version = probe(binary, ['--version'], { env, timeoutMs: 60_000 }).stdout.trim().split('\n').pop();
    return version && version !== MAESTRO_VERSION
        ? `Maestro ${version} is installed; the flows are written against ${MAESTRO_VERSION}.`
        : null;
}

/**
 * Maestro nests screenshots under `<timestamp>/<flow name>/takeScreenshot/`. Copy each checkpoint
 * to the top of the scenario's folder, beside `final.png`, so a reader finds them where the module
 * doc says; returns the copies.
 */
function liftCheckpoints(outDir) {
    return collectCheckpoints(outDir).map(file => {
        const lifted = path.join(outDir, path.basename(file));
        if (file !== lifted) fs.copyFileSync(file, lifted);
        return lifted;
    });
}

/** Screenshots a flow took with `takeScreenshot: checkpoint-…`, oldest first. */
function collectCheckpoints(dir) {
    const found = [];
    const walk = current => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (/^checkpoint-.*\.png$/.test(entry.name)) found.push(full);
        }
    };
    if (fs.existsSync(dir)) walk(dir);
    return found.sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
}

async function run({ deviceId, flowFile, outDir, vars, env, logFile }) {
    const binary = maestroBinary(env);
    const args = [
        '--device',
        deviceId,
        'test',
        flowFile,
        '--format',
        'junit',
        '--output',
        path.join(outDir, 'report.xml'),
    ];
    args.push('--test-output-dir', outDir, '--debug-output', path.join(outDir, 'maestro-debug'));
    for (const [key, value] of Object.entries(vars)) args.push('-e', `${key}=${value}`);

    const result = await runLogged(binary, args, {
        // Relative `takeScreenshot` paths resolve against the working directory.
        cwd: outDir,
        env: {
            ...env,
            MAESTRO_CLI_NO_ANALYTICS: '1',
            MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: 'true',
            // The XCTest driver takes a while to come up on a loaded machine; the default gives up early.
            MAESTRO_DRIVER_STARTUP_TIMEOUT: '180000',
        },
        logFile,
        timeoutMs: 20 * 60_000,
    });
    const output = tail(logFile, 80);
    const checkpoints = [...new Set(liftCheckpoints(outDir))];
    if (result.status === 0) return { passed: true, summary: 'Maestro: all steps passed', checkpoints };
    if (TOOL_FAILURE_PATTERNS.some(pattern => pattern.test(output))) {
        throw new EnvironmentError('Maestro could not drive the device (the app was not exercised).', [
            `Read ${logFile}`,
        ]);
    }
    // Maestro's own verdict line, e.g. `[Failed] <flow> (1m 54s) (Assertion is false: "X" is visible)`.
    const lines = output.split('\n').reverse();
    const failedStep =
        lines.find(line => /^\[Failed\]/.test(line.trim())) ??
        lines.find(line => /FAILED|Assertion is false|not found/i.test(line));
    return { passed: false, summary: `Maestro: ${failedStep?.trim() ?? 'a step failed'}`, checkpoints };
}

module.exports = {
    name: 'maestro',
    flowExtension: '.yaml',
    MAESTRO_VERSION,
    TOOL_FAILURE_PATTERNS,
    readMeta,
    preflight,
    versionWarning,
    collectCheckpoints,
    liftCheckpoints,
    run,
};
