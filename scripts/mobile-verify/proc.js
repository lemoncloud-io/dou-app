const fs = require('fs');
const http = require('http');
const readline = require('readline');
const { spawn, spawnSync } = require('child_process');

/** Run a short probe and capture its output. Never throws; `status` is null when it timed out. */
function probe(command, args = [], { cwd, env, timeoutMs = 30_000 } = {}) {
    const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: timeoutMs });
    return {
        status: result.error ? null : result.status,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        error: result.error,
    };
}

/** True when `command` resolves on PATH (or is an existing absolute path). */
function hasCommand(command, env) {
    if (command.startsWith('/')) return fs.existsSync(command);
    return probe('/bin/sh', ['-c', `command -v "${command}"`], { env }).status === 0;
}

/**
 * Log lines that carry env values. react-native-config's iOS script prints the whole env it read
 * (`read dotenv {…}`) into the build output; the log lands inside the checkout and gets read by
 * people and agents looking for an error, so the values never reach it.
 */
const REDACTIONS = [[/^(\s*read dotenv ).*$/, '$1<redacted by the device-verify runner>']];

function redactLine(line) {
    return REDACTIONS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), line);
}

/**
 * Children of long steps still running (a build, an install, the scenario tool). The runner stops
 * them when it is stopped, so a Ctrl-C during a build does not leave xcodebuild or Gradle running
 * after the machine lock is released.
 */
const liveChildren = new Set();

function stopLiveChildren() {
    for (const child of liveChildren) {
        try {
            child.kill('SIGTERM');
        } catch {
            // Already gone.
        }
    }
}

/**
 * Run a long step (a build, an install) with its output appended to `logFile`, so the terminal
 * stays readable and the full log is there when it fails. Every line passes through `redactLine`.
 * Resolves with the exit status.
 */
function runLogged(command, args, { cwd, env, logFile, timeoutMs }) {
    return new Promise(resolve => {
        const out = fs.createWriteStream(logFile, { flags: 'a' });
        out.write(`\n$ ${command} ${args.join(' ')}\n`);
        const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
        liveChildren.add(child);
        for (const stream of [child.stdout, child.stderr]) {
            readline.createInterface({ input: stream }).on('line', line => out.write(`${redactLine(line)}\n`));
        }
        const timer = timeoutMs ? setTimeout(() => child.kill('SIGTERM'), timeoutMs) : null;
        const finish = result => {
            if (timer) clearTimeout(timer);
            liveChildren.delete(child);
            out.end(() => resolve(result));
        };
        child.on('close', (code, signal) => finish({ status: code, signal }));
        child.on('error', () => finish({ status: null, signal: null }));
    });
}

/**
 * Start a long-lived server (vite, Metro, the emulator) in its own process group, output to
 * `logFile`. The group matters: `npx` and the tools behind it spawn children, and killing only the
 * parent would leave them holding the port after the run.
 */
function startBackground(command, args, { cwd, env, logFile }) {
    const fd = fs.openSync(logFile, 'a');
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', fd, fd], detached: true });
    fs.closeSync(fd);
    // Without a listener a spawn failure (a missing binary) is an uncaught exception that skips cleanup.
    child.on('error', error =>
        fs.appendFileSync(logFile, `\n[device-verify] could not start ${command}: ${error.message}\n`)
    );
    return {
        child,
        /** True once the process has exited (or never started). */
        exited: () => child.exitCode !== null || child.signalCode !== null || child.pid === undefined,
        stop(signal = 'SIGTERM') {
            try {
                process.kill(-child.pid, signal);
            } catch {
                // Already gone.
            }
        },
    };
}

/** GET a URL once; resolves { status, body } or null when nothing answered. */
function httpGet(url, timeoutMs = 5000) {
    return new Promise(resolve => {
        const request = http.get(url, { timeout: timeoutMs }, response => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', chunk => (body += chunk.length < 4096 ? chunk : ''));
            response.on('end', () => resolve({ status: response.statusCode, body }));
        });
        request.on('timeout', () => request.destroy());
        request.on('error', () => resolve(null));
    });
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Poll `check` (async, truthy = done) until it passes or `timeoutMs` runs out. */
async function waitFor(check, { timeoutMs, intervalMs = 1000, abort = () => false }) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await check()) return true;
        if (abort()) return false;
        await sleep(intervalMs);
    }
    return false;
}

/** Last `count` lines of a log file, for the failure summary. */
function tail(file, count = 30) {
    try {
        const lines = fs.readFileSync(file, 'utf8').trimEnd().split('\n');
        return lines.slice(-count).join('\n');
    } catch {
        return '';
    }
}

module.exports = {
    probe,
    hasCommand,
    redactLine,
    runLogged,
    stopLiveChildren,
    startBackground,
    httpGet,
    sleep,
    waitFor,
    tail,
};
