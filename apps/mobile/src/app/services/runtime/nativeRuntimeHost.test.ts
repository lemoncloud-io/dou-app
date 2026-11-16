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
});
