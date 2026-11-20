import type { NativeRuntimeBoot } from '@chatic/runtime-mobile';

import type { ILogService } from '../log';
import { createNativeRuntimeHost } from './nativeRuntimeHost';
import type { NativeRuntimeHostDeps } from './nativeRuntimeHost';

const logService = () =>
    ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) as unknown as jest.Mocked<ILogService>;

const booted = (): NativeRuntimeBoot =>
    ({
        engine: { name: 'engine' },
        vault: { status: 'available', values: {} },
        secretStorage: 'vault',
    }) as unknown as NativeRuntimeBoot;

const setup = (overrides: Partial<NativeRuntimeHostDeps> = {}) => {
    const deps = {
        readOwner: jest.fn(() => 'native' as const),
        boot: jest.fn(async () => booted()),
        run: jest.fn(() => () => undefined),
        logService: logService(),
        ...overrides,
    };
    return { deps, host: createNativeRuntimeHost(deps) };
};

describe('createNativeRuntimeHost', () => {
    it('touches nothing on a launch the page owns', async () => {
        const { deps, host } = setup({ readOwner: jest.fn(() => 'web' as const) });

        await expect(host.start()).resolves.toBeNull();
        expect(host.owner()).toBe('web');
        expect(deps.boot).not.toHaveBeenCalled();
        expect(deps.run).not.toHaveBeenCalled();
    });

    it('boots and runs once, however often it is started, and keeps the engine', async () => {
        const { deps, host } = setup();

        const [first, second] = await Promise.all([host.start(), host.start()]);
        await host.start();

        expect(first).toBe(second);
        expect(host.engine()).toBe(first);
        expect(deps.boot).toHaveBeenCalledTimes(1);
        expect(deps.run).toHaveBeenCalledWith(first);
        expect(deps.logService.info).toHaveBeenCalledWith(
            'session.native_runtime_started',
            'Native runtime started',
            expect.objectContaining({ vault: 'available', secretStorage: 'vault' })
        );
    });

    it('reads the owner once per process', () => {
        const { deps, host } = setup();
        host.owner();
        host.owner();
        expect(deps.readOwner).toHaveBeenCalledTimes(1);
    });

    it('answers null and logs what was missing when the boot fails, leaving the session to the page', async () => {
        const failure = Object.assign(new Error('no env'), { missing: ['VITE_HOST'] });
        const { deps, host } = setup({ boot: jest.fn(async () => Promise.reject(failure)) });

        await expect(host.start()).resolves.toBeNull();
        expect(host.engine()).toBeNull();
        expect(deps.run).not.toHaveBeenCalled();
        expect(deps.logService.error).toHaveBeenCalledWith('session.native_runtime_failed', expect.any(String), {
            error: failure,
            data: { missing: ['VITE_HOST'] },
        });
    });

    it('answers null and logs a decline, not a failure, when the vault holds no session', async () => {
        const declined = Object.assign(new Error('no session'), {
            code: 'NATIVE_RUNTIME_NO_SESSION',
            secretStorage: 'empty',
        });
        const { deps, host } = setup({ boot: jest.fn(async () => Promise.reject(declined)) });

        await expect(host.start()).resolves.toBeNull();
        expect(host.engine()).toBeNull();
        expect(deps.run).not.toHaveBeenCalled();
        expect(deps.logService.error).not.toHaveBeenCalled();
        expect(deps.logService.info).toHaveBeenCalledWith('session.native_runtime_declined', expect.any(String), {
            secretStorage: 'empty',
        });
        // Once per process: a page that says hello again hears the same answer without another boot.
        await expect(host.start()).resolves.toBeNull();
        expect(deps.boot).toHaveBeenCalledTimes(1);
    });

    it('tells its listeners when a session ends, and survives one that throws', async () => {
        let leaveToHome: (params: URLSearchParams) => void = () => undefined;
        const { host, deps } = setup({
            boot: jest.fn(async (leave: (params: URLSearchParams) => void) => {
                leaveToHome = leave;
                return booted();
            }),
        });
        const heard: string[] = [];
        host.onSessionEnded(() => {
            throw new Error('listener bug');
        });
        const stop = host.onSessionEnded(params => heard.push(params.toString()));
        await host.start();

        leaveToHome(new URLSearchParams('logout=1'));
        stop();
        leaveToHome(new URLSearchParams('logout=1'));

        expect(heard).toEqual(['logout=1']);
        expect(deps.logService.error).toHaveBeenCalledWith('session.native_ended', expect.any(String), {
            error: expect.any(Error),
        });
    });

    describe('holdsSession', () => {
        it('holds from the first start, while it boots, and on once it has started', async () => {
            let finishBoot: (boot: NativeRuntimeBoot) => void = () => undefined;
            const onHoldChange = jest.fn();
            const { host } = setup({
                boot: jest.fn(() => new Promise<NativeRuntimeBoot>(resolve => (finishBoot = resolve))),
                onHoldChange,
            });
            expect(host.holdsSession()).toBe(false);

            const started = host.start();
            // A page loaded while the boot runs must not run its own session beside it.
            expect(host.holdsSession()).toBe(true);
            finishBoot(booted());
            await started;

            expect(host.holdsSession()).toBe(true);
            expect(onHoldChange.mock.calls).toEqual([[true]]);
        });

        it('lets go once a start answers null — a decline leaves the session to the page', async () => {
            const declined = Object.assign(new Error('no session'), { code: 'NATIVE_RUNTIME_NO_SESSION' });
            const onHoldChange = jest.fn();
            const { host } = setup({ boot: jest.fn(async () => Promise.reject(declined)), onHoldChange });

            await host.start();

            expect(host.holdsSession()).toBe(false);
            expect(onHoldChange.mock.calls).toEqual([[true], [false]]);
        });

        it('lets go when the start itself rejects, so a page is not held out for the rest of the process', async () => {
            const { host, deps } = setup();
            deps.logService.info.mockImplementation(() => {
                throw new Error('log sink down');
            });

            await expect(host.start()).rejects.toThrow('log sink down');
            await Promise.resolve();

            expect(host.holdsSession()).toBe(false);
        });

        it('never holds on a launch the page owns', async () => {
            const onHoldChange = jest.fn();
            const { host } = setup({ readOwner: jest.fn(() => 'web' as const), onHoldChange });

            await host.start();

            expect(host.holdsSession()).toBe(false);
            expect(onHoldChange).not.toHaveBeenCalled();
        });

        it('still holds when the listener throws, and logs it', async () => {
            const { host, deps } = setup({
                onHoldChange: jest.fn(() => {
                    throw new Error('listener bug');
                }),
            });

            await host.start();

            expect(host.holdsSession()).toBe(true);
            expect(deps.logService.error).toHaveBeenCalledWith('session.native_hold', expect.any(String), {
                error: expect.any(Error),
            });
        });
    });
});
