const fs = require('fs');
const os = require('os');
const path = require('path');

const { parseArgs, prodRefusal, resolveEnv } = require('../local/args');
const { findProblems } = require('../local/preflight');
const { webEnv, shellEnv, runAll, waitForUrl } = require('../local/index');
const { createEnvSwitcher, shellUrl } = require('../local/pairs');

/** A checkout with only the files a test names, so preflight is judged on exactly those. */
const makeCheckout = files => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'local-test-'));
    for (const [relative, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
        fs.writeFileSync(path.join(root, relative), content);
    }
    return root;
};

const COMPLETE = {
    'node_modules/.keep': '',
    'apps/web/.env': 'VITE_ENV=DEV\n',
    'apps/web/.env.dev': 'VITE_ENV=DEV\nVITE_DOU_ENDPOINT=https://dev.example\n',
    'apps/web/.env.prod': 'VITE_ENV=PROD\nVITE_DOU_ENDPOINT=https://prod.example\n',
    'apps/mobile/.env.dev': 'VITE_ENV=DEV\nVITE_GOOGLE_WEB_CLIENT_ID=dev-client\n',
    'apps/mobile/.env.prod': 'VITE_ENV=PROD\nVITE_GOOGLE_WEB_CLIENT_ID=prod-client\n',
};
const freePorts = { portFree: async () => true };

describe('yarn local', () => {
    describe('parseArgs', () => {
        it('defaults to the shell mode with the backend still to choose', () => {
            expect(parseArgs([])).toEqual({ mode: 'shell', env: null, platform: 'ios', help: false });
        });

        it('reads mode, env and platform', () => {
            expect(parseArgs(['--mode', 'native', '--platform', 'android'])).toMatchObject({
                mode: 'native',
                platform: 'android',
            });
            expect(parseArgs(['--env', 'prod'])).toMatchObject({ mode: 'shell', env: 'prod' });
        });

        it('refuses what it does not know', () => {
            expect(() => parseArgs(['--mode', 'tablet'])).toThrow('--mode must be one of');
            expect(() => parseArgs(['--env'])).toThrow('--env needs a value.');
            expect(() => parseArgs(['--fast'])).toThrow('Unknown argument: --fast');
        });
    });

    describe('prodRefusal', () => {
        it('takes prod in the shell mode only', () => {
            expect(prodRefusal({ mode: 'shell', env: 'prod' })).toBeNull();
            expect(prodRefusal({ mode: 'web', env: 'prod' })).toMatch(/only be chosen in shell mode/);
            expect(prodRefusal({ mode: 'native', env: 'prod' })).toMatch(/only be chosen in shell mode/);
            expect(prodRefusal({ mode: 'web', env: 'dev' })).toBeNull();
        });
    });

    describe('resolveEnv', () => {
        const ask = answer => jest.fn(async () => answer);

        it('uses a named backend without asking', async () => {
            const question = ask('');
            await expect(
                resolveEnv({ mode: 'shell', env: 'prod' }, { interactive: true, ask: question })
            ).resolves.toBe('prod');
            expect(question).not.toHaveBeenCalled();
        });

        it('takes dev without a question when nobody can answer one', async () => {
            const question = ask('prod');
            await expect(resolveEnv({ mode: 'shell', env: null }, { interactive: false, ask: question })).resolves.toBe(
                'dev'
            );
            expect(question).not.toHaveBeenCalled();
        });

        it('asks at a terminal, Enter taking dev', async () => {
            await expect(resolveEnv({ mode: 'shell', env: null }, { interactive: true, ask: ask('') })).resolves.toBe(
                'dev'
            );
            await expect(
                resolveEnv({ mode: 'shell', env: null }, { interactive: true, ask: ask(' PROD ') })
            ).resolves.toBe('prod');
            await expect(
                resolveEnv({ mode: 'shell', env: null }, { interactive: true, ask: ask('stage') })
            ).rejects.toThrow('stage');
        });

        it('does not ask in the web mode, where prod is never an answer', async () => {
            const question = ask('prod');
            await expect(resolveEnv({ mode: 'web', env: null }, { interactive: true, ask: question })).resolves.toBe(
                'dev'
            );
            expect(question).not.toHaveBeenCalled();
        });

        it('chooses nothing for the native mode, which runs on the checkout’s own env file', async () => {
            await expect(
                resolveEnv({ mode: 'native', env: null }, { interactive: true, ask: ask('') })
            ).resolves.toBeNull();
        });
    });

    describe('findProblems', () => {
        it('finds nothing in a complete checkout', async () => {
            await expect(
                findProblems(makeCheckout(COMPLETE), { mode: 'shell', env: 'dev' }, freePorts)
            ).resolves.toEqual([]);
        });

        it('names each missing file and where to get it', async () => {
            const { ['apps/web/.env.dev']: _web, ['apps/mobile/.env.dev']: _mobile, ...rest } = COMPLETE;
            const problems = await findProblems(makeCheckout(rest), { mode: 'shell', env: 'dev' }, freePorts);

            expect(problems.map(problem => problem.message)).toEqual([
                "apps/web/.env.dev is missing — the web's dev backend settings.",
                'apps/mobile/.env.dev is missing — the shell reads the Google sign-in client from it.',
            ]);
            expect(problems.every(problem => problem.fix)).toBe(true);
        });

        it('asks for the Google client only in the shell mode', async () => {
            const root = makeCheckout({ ...COMPLETE, 'apps/mobile/.env.dev': 'VITE_ENV=DEV\n' });

            expect(
                (await findProblems(root, { mode: 'shell', env: 'dev' }, freePorts)).map(problem => problem.message)
            ).toEqual([
                'apps/mobile/.env.dev has no VITE_GOOGLE_WEB_CLIENT_ID — Google sign-in in the shell needs it.',
            ]);
            await expect(findProblems(root, { mode: 'web', env: 'dev' }, freePorts)).resolves.toEqual([]);
        });

        it('reports a port another process holds instead of taking it', async () => {
            const problems = await findProblems(
                makeCheckout(COMPLETE),
                { mode: 'shell', env: 'dev' },
                { portFree: async port => port !== 5007 }
            );

            expect(problems.map(problem => problem.message)).toEqual([
                'port 5007 is taken by another process (left running, not stopped).',
            ]);
        });

        it('checks only the install for the native mode, which runs its own check', async () => {
            await expect(findProblems(makeCheckout({}), { mode: 'native', env: null }, freePorts)).resolves.toEqual([
                { message: 'node_modules is missing — dependencies are not installed.', fix: 'yarn install' },
            ]);
        });
    });

    describe('child environments', () => {
        it("gives the web the chosen backend's file over the process environment", () => {
            const root = makeCheckout(COMPLETE);

            expect(webEnv(root, 'prod', { VITE_ENV: 'LOCAL', PATH: '/bin' })).toEqual({
                VITE_ENV: 'PROD',
                VITE_DOU_ENDPOINT: 'https://prod.example',
                PATH: '/bin',
            });
            // `apps/web/.env` first, as `nx serve` would load it; the backend's file wins over it.
            const local = makeCheckout({ ...COMPLETE, 'apps/web/.env': 'VITE_ENV=DEV\nVITE_ONLY_LOCAL=yes\n' });
            expect(webEnv(local, 'prod', {})).toMatchObject({ VITE_ENV: 'PROD', VITE_ONLY_LOCAL: 'yes' });
        });

        it('gives the Google client to the shell and never to the web', () => {
            const root = makeCheckout(COMPLETE);

            expect(shellEnv(root, 'dev', {})).toEqual({
                VIRTUAL_SHELL_ENV: 'dev',
                VIRTUAL_SHELL_PORT: '5007',
                VIRTUAL_SHELL_WEB_ORIGIN: 'http://localhost:5003',
                VIRTUAL_SHELL_GOOGLE_CLIENT_ID: 'dev-client',
            });
            expect(Object.keys(webEnv(root, 'dev', {}))).not.toContain('VITE_GOOGLE_WEB_CLIENT_ID');
        });
    });
    describe('runAll', () => {
        const exited = child =>
            new Promise(resolve =>
                child.exitCode !== null || child.signalCode !== null ? resolve() : child.on('exit', resolve)
            );
        const signals = () => {
            const handlers = {};
            return { handlers, onSignal: (signal, handler) => (handlers[signal] = handler) };
        };

        it('stops the others when one child exits, with that child’s code', async () => {
            const { onSignal } = signals();
            const before = process.exitCode;
            const { children } = runAll(
                [
                    {
                        name: 'quick',
                        command: process.execPath,
                        args: ['-e', 'process.exit(3)'],
                        cwd: __dirname,
                        env: process.env,
                    },
                    {
                        name: 'long',
                        command: process.execPath,
                        args: ['-e', 'setInterval(() => {}, 1000)'],
                        cwd: __dirname,
                        env: process.env,
                    },
                ],
                { onSignal }
            );
            await Promise.all(children.map(exited));

            expect(children[1].signalCode).toBe('SIGTERM');
            expect(process.exitCode).toBe(3);
            process.exitCode = before;
        });

        it('stops everything on a terminal hang-up, and kills outright on a second signal', async () => {
            const { handlers, onSignal } = signals();
            const before = process.exitCode;
            const { children } = runAll(
                [
                    {
                        name: 'stubborn',
                        command: process.execPath,
                        args: ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"],
                        cwd: __dirname,
                        env: process.env,
                    },
                ],
                { onSignal }
            );
            await new Promise(resolve => setTimeout(resolve, 300));
            handlers.SIGHUP();
            handlers.SIGINT();
            await exited(children[0]);

            expect(children[0].signalCode).toBe('SIGKILL');
            expect(process.exitCode).toBe(129);
            process.exitCode = before;
        });

        it('stops with 1 when a child cannot start at all', async () => {
            const { onSignal } = signals();
            const before = process.exitCode;
            const error = jest.spyOn(console, 'error').mockImplementation(() => {});
            runAll([{ name: 'missing', command: '/nonexistent/binary', args: [], cwd: __dirname, env: process.env }], {
                onSignal,
            });
            await new Promise(resolve => setTimeout(resolve, 200));

            expect(process.exitCode).toBe(1);
            expect(error).toHaveBeenCalledWith(expect.stringContaining('missing could not start'));
            error.mockRestore();
            process.exitCode = before;
        });
    });
    describe('environment pairs', () => {
        it('checks the ports of the backend it starts', async () => {
            const asked = [];
            const portFree = async port => {
                asked.push(port);
                return true;
            };
            await findProblems(makeCheckout(COMPLETE), { mode: 'shell', env: 'prod' }, { portFree });
            await findProblems(makeCheckout(COMPLETE), { mode: 'web', env: 'dev' }, { portFree });

            expect(asked).toEqual([5013, 5017, 5003]);
        });

        it("gives each backend's shell its own ports", () => {
            const root = makeCheckout(COMPLETE);

            expect(shellEnv(root, 'prod', {})).toMatchObject({
                VIRTUAL_SHELL_PORT: '5017',
                VIRTUAL_SHELL_WEB_ORIGIN: 'http://localhost:5013',
                VIRTUAL_SHELL_GOOGLE_CLIENT_ID: 'prod-client',
            });
            expect(shellUrl('prod')).toBe('http://localhost:5017/__shell/');
        });
    });

    describe('createEnvSwitcher', () => {
        const make = (overrides = {}) => {
            const running = new Set(['dev']);
            const startPair = jest.fn();
            const onProd = jest.fn();
            const switchEnv = createEnvSwitcher({
                running,
                findProblems: async () => [],
                startPair,
                waitReady: async () => true,
                onProd,
                ...overrides,
            });
            return { running, startPair, onProd, switchEnv };
        };

        it('starts the other pair once and sends the page there', async () => {
            const { switchEnv, startPair, onProd, running } = make();

            await expect(switchEnv('prod')).resolves.toEqual({ ok: true, url: 'http://localhost:5017/__shell/' });
            await expect(switchEnv('prod')).resolves.toEqual({ ok: true, url: 'http://localhost:5017/__shell/' });

            expect(startPair).toHaveBeenCalledTimes(1);
            expect(onProd).toHaveBeenCalledTimes(1);
            expect([...running]).toEqual(['dev', 'prod']);
        });

        it('only points at a pair already running', async () => {
            const { switchEnv, startPair } = make();

            await expect(switchEnv('dev')).resolves.toEqual({ ok: true, url: 'http://localhost:5007/__shell/' });
            expect(startPair).not.toHaveBeenCalled();
        });

        it('starts nothing when the backend is missing what it needs, and says what', async () => {
            const problems = [{ message: 'apps/web/.env.prod is missing.', fix: 'ask a teammate' }];
            const { switchEnv, startPair, running } = make({ findProblems: async () => problems });

            await expect(switchEnv('prod')).resolves.toEqual({ ok: false, problems });
            expect(startPair).not.toHaveBeenCalled();
            expect(running.has('prod')).toBe(false);
        });

        it('says so when the new pair never answers', async () => {
            const { switchEnv } = make({ waitReady: async () => false });

            await expect(switchEnv('prod')).resolves.toMatchObject({ ok: false });
        });

        it('refuses a backend it does not know', async () => {
            const { switchEnv } = make();

            await expect(switchEnv('stage')).resolves.toMatchObject({ ok: false });
        });
    });

    describe('runAll.add', () => {
        it('stops only the set it added when one of those exits, leaving the first pair running', async () => {
            const onSignal = () => undefined;
            const supervisor = runAll(
                [
                    {
                        name: 'first',
                        command: process.execPath,
                        args: ['-e', 'setInterval(() => {}, 1000)'],
                        cwd: __dirname,
                        env: process.env,
                    },
                ],
                { onSignal }
            );
            const onExit = jest.fn();
            const added = supervisor.add(
                [
                    {
                        name: 'quick',
                        command: process.execPath,
                        args: ['-e', 'process.exit(2)'],
                        cwd: __dirname,
                        env: process.env,
                    },
                    {
                        name: 'partner',
                        command: process.execPath,
                        args: ['-e', 'setInterval(() => {}, 1000)'],
                        cwd: __dirname,
                        env: process.env,
                    },
                ],
                onExit
            );
            const log = jest.spyOn(console, 'log').mockImplementation(() => {});
            await new Promise(resolve => added[1].on('exit', resolve));

            expect(onExit).toHaveBeenCalledWith(2);
            expect(supervisor.initial[0].exitCode).toBeNull();
            const before = process.exitCode;
            supervisor.stop(0);
            await new Promise(resolve => supervisor.initial[0].on('exit', resolve));
            process.exitCode = before;
            log.mockRestore();
        });
    });

    describe('waitForUrl', () => {
        it('resolves when the address answers, and gives up after the timeout', async () => {
            let calls = 0;
            const answersSecondTime = async () => {
                calls += 1;
                if (calls < 2) throw new Error('refused');
            };

            await expect(waitForUrl('http://x', 1000, { fetchImpl: answersSecondTime, intervalMs: 5 })).resolves.toBe(
                true
            );
            await expect(
                waitForUrl('http://x', 30, {
                    fetchImpl: async () => {
                        throw new Error('refused');
                    },
                    intervalMs: 5,
                })
            ).resolves.toBe(false);
        });
    });
});
