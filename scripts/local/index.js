#!/usr/bin/env node
/**
 * `yarn local` — run the app locally in one of three ways (apps/virtual-shell/README.md):
 *
 *   shell   (default) the web dev server plus the virtual mobile shell, which proxies it and shows it
 *           inside a phone frame as if it ran in the app — no simulator, no mobile toolchain
 *   web     the web dev server alone
 *   native  the existing simulator/emulator scripts, unchanged
 *
 * The backend is chosen by handing `apps/web/.env.<env>` to the web dev server as its process
 * environment. A variable already in the process environment wins over Vite's own env files, and the
 * web's `html-env-injection` plugin reads the process environment too, so this switches every endpoint
 * without touching `apps/web`. Passing only Vite's `--mode` would not: under `nx serve`, the values Nx
 * loads from `apps/web/.env` first would still win.
 */
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');

const { USAGE, parseArgs, prodRefusal, resolveEnv } = require('./args');
const { findProblems, formatProblems, readEnv } = require('./preflight');
const { PAIRS, shellUrl, createEnvSwitcher } = require('./pairs');

const ROOT = path.resolve(__dirname, '../..');

/**
 * The web dev server's environment: this process's, then `apps/web/.env` — what `nx serve` would have
 * loaded first — then the chosen backend's file over both. Only the web's own files: the shell's Google
 * client never reaches the web, whose `html-env-injection` would write every `VITE_*` it is given into
 * the page.
 */
function webEnv(root, env, base = process.env) {
    return {
        ...base,
        ...Object.fromEntries(readEnv(root, 'apps/web/.env')),
        ...Object.fromEntries(readEnv(root, `apps/web/.env.${env}`)),
    };
}

/**
 * The web dev server, run as Vite directly in `apps/web` — as the e2e suite runs it — rather than
 * through `nx serve`: Nx runs one `web:serve` per workspace at a time, so a second backend's web would
 * wait on the first forever. `--strictPort`: a port taken after the check must fail the start, not move
 * the server to the next port while the shell keeps proxying this one.
 */
function webServer(root, env, port) {
    return {
        name: `web (${env})`,
        command: process.execPath,
        args: [path.join(root, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort'],
        cwd: path.join(root, 'apps/web'),
        env: webEnv(root, env),
    };
}

/** The shell server's environment: where the web is, which backend, and the Google client to sign in with. */
function shellEnv(root, env, base = process.env) {
    return {
        ...base,
        VIRTUAL_SHELL_ENV: env,
        VIRTUAL_SHELL_PORT: String(PAIRS[env].shell),
        VIRTUAL_SHELL_WEB_ORIGIN: `http://localhost:${PAIRS[env].web}`,
        VIRTUAL_SHELL_GOOGLE_CLIENT_ID: readEnv(root, `apps/mobile/.env.${env}`).get('VITE_GOOGLE_WEB_CLIENT_ID') ?? '',
    };
}

/** Thrown when the person presses Ctrl-C at the prompt, so the run ends as an interrupt (130). */
class Interrupted extends Error {}

function ask(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve, reject) => {
        // Without this, Ctrl-C at the prompt only pauses readline: nothing settles and the process
        // drains out with exit code 0, as if it had run.
        rl.on('SIGINT', () => {
            rl.close();
            reject(new Interrupted('Interrupted.'));
        });
        rl.question(question, answer => {
            rl.close();
            resolve(answer);
        });
    });
}

const PROD_WARNING = [
    '',
    '  ┌──────────────────────────────────────────────────────────────┐',
    '  │  PROD — the web talks to the production backend.            │',
    '  │  Real accounts, real data. Do not send, delete or invite.   │',
    '  └──────────────────────────────────────────────────────────────┘',
    '',
].join('\n');

/** How long a child may take to stop after SIGTERM before its group is killed outright. */
const KILL_AFTER_MS = 5_000;

/**
 * Starts the children and stops them all when one exits or this process is told to stop.
 *
 * Each child gets its own process group and the whole group is signalled: `nx serve` runs Vite under
 * a task runner, and signalling only the direct child leaves those below it running — holding the
 * port and Nx's task lock, so the next `yarn local` waits on a server nobody can see. Being in their
 * own groups, the children no longer hear the terminal close (SIGHUP) either, so this process handles
 * that too. A group that has not gone after `KILL_AFTER_MS`, or a second Ctrl-C, gets SIGKILL.
 *
 * `add` starts more children later — another backend's pair. Those stop with everything else, but one
 * of them exiting stops only its own set (`onExit` is told), never the pair the run started with.
 */
function runAll(children, { onSignal = (signal, handler) => process.on(signal, handler) } = {}) {
    const running = [];
    let stopping = false;
    const signalGroup = (child, signal) => {
        if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
        try {
            process.kill(-child.pid, signal);
        } catch {
            // The group is already gone.
        }
    };
    const signalAll = signal => running.forEach(child => signalGroup(child, signal));
    const stop = code => {
        if (stopping) {
            signalAll('SIGKILL');
            return;
        }
        stopping = true;
        process.exitCode = code;
        signalAll('SIGTERM');
        setTimeout(() => signalAll('SIGKILL'), KILL_AFTER_MS).unref();
    };
    const spawnSet = (set, onSetExit) => {
        const spawned = [];
        let ended = false;
        for (const { name, command, args, cwd, env, onMessage } of set) {
            const stdio = onMessage ? ['inherit', 'inherit', 'inherit', 'ipc'] : 'inherit';
            const child = spawn(command, args, { cwd, env, stdio, detached: true });
            if (onMessage) child.on('message', message => onMessage(message, child));
            child.on('error', error => {
                console.error(`[local] ${name} could not start: ${error.message}`);
                onSetExit(1);
            });
            child.on('exit', code => {
                // Already stopping: the others are on their way down, and a second stop() would kill them.
                if (stopping || ended) return;
                console.log(`\n[local] ${name} exited (${code ?? 'signal'}).`);
                ended = true;
                spawned.forEach(other => other !== child && signalGroup(other, 'SIGTERM'));
                onSetExit(code ?? 1);
            });
            running.push(child);
            spawned.push(child);
        }
        return spawned;
    };
    const initial = spawnSet(children, code => {
        if (running.length > 1) console.log('[local] stopping the rest.');
        stop(code);
    });
    onSignal('SIGINT', () => stop(130));
    onSignal('SIGTERM', () => stop(143));
    onSignal('SIGHUP', () => stop(129));
    return {
        children: running,
        initial,
        stop,
        add: (set, onExit = () => undefined) => spawnSet(set, onExit),
    };
}

/** Resolves once `url` answers at all, or `false` after `timeoutMs`. */
async function waitForUrl(url, timeoutMs, { fetchImpl = globalThis.fetch, intervalMs = 1_000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            await fetchImpl(url, { method: 'HEAD' });
            return true;
        } catch {
            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
    }
    return false;
}

/** The two servers of one backend: the web dev server, and the shell that proxies it (talking back over IPC). */
function pairFor(root, env, onMessage) {
    const { web, shell } = PAIRS[env];
    return [
        webServer(root, env, web),
        {
            name: `shell (${env})`,
            command: process.execPath,
            args: [path.join(root, 'node_modules/vite/bin/vite.js'), '--strictPort'],
            cwd: path.join(root, 'apps/virtual-shell'),
            env: shellEnv(root, env),
            onMessage,
        },
    ];
}

async function main(argv) {
    let options;
    try {
        options = parseArgs(argv);
    } catch (error) {
        console.error(`${error.message}\n\n${USAGE}`);
        return 1;
    }
    if (options.help) {
        console.log(USAGE);
        return 0;
    }
    let env;
    try {
        env = await resolveEnv(options, { interactive: !!(process.stdin.isTTY && process.stdout.isTTY), ask });
    } catch (error) {
        console.error(error.message);
        return error instanceof Interrupted ? 130 : 1;
    }
    // Judged on the resolved backend, not the flag: a prompt answer must not reach prod where a flag cannot.
    const refusal = prodRefusal({ ...options, env: env ?? options.env });
    if (refusal) {
        console.error(refusal);
        return 1;
    }
    const problems = await findProblems(ROOT, { mode: options.mode, env });
    if (problems.length) {
        console.error(formatProblems(problems));
        return 1;
    }

    if (options.mode === 'native') {
        if (options.env)
            console.log('[local] native mode builds the dev app from apps/mobile/.env as it is; --env is not used.');
        runAll([
            {
                name: 'native',
                command: 'yarn',
                args: [`mobile:${options.platform}:local`],
                cwd: ROOT,
                env: process.env,
            },
        ]);
        return null;
    }

    if (options.mode === 'web') {
        const port = PAIRS.dev.web;
        console.log(`[local] web · ${env} → http://localhost:${port}`);
        runAll([webServer(ROOT, env, port)]);
        return null;
    }

    if (env === 'prod') console.warn(PROD_WARNING);
    console.log(`[local] virtual shell · ${env} → ${shellUrl(env)}`);
    // A shell page asks, over its server's IPC channel, for the other backend; the answer goes back the same way.
    const running = new Set([env]);
    let supervisor = null;
    const onMessage = (message, child) => {
        if (!message || message.type !== 'switch-env') return;
        void switchEnv(message.env).then(
            result => child.connected && child.send({ type: 'switch-env-result', id: message.id, ...result })
        );
    };
    const switchEnv = createEnvSwitcher({
        running,
        findProblems: next => findProblems(ROOT, { mode: 'shell', env: next }),
        startPair: next => {
            console.log(`[local] starting the ${next} pair → ${shellUrl(next)}`);
            supervisor.add(pairFor(ROOT, next, onMessage), () => {
                running.delete(next);
                console.log(`[local] the ${next} pair stopped; the ${env} pair keeps running.`);
            });
        },
        waitReady: (next, timeoutMs) =>
            Promise.all([
                waitForUrl(`http://localhost:${PAIRS[next].web}/`, timeoutMs),
                waitForUrl(shellUrl(next), timeoutMs),
            ]).then(results => results.every(Boolean)),
        onProd: () => console.warn(PROD_WARNING),
    });
    supervisor = runAll(pairFor(ROOT, env, onMessage));
    return null;
}

if (require.main === module) {
    main(process.argv.slice(2)).then(code => {
        if (code !== null) process.exit(code);
    });
}

module.exports = { main, webEnv, shellEnv, runAll, waitForUrl };
