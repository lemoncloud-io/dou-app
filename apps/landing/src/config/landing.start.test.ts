import type * as RuntimeWeb from '@chatic/runtime-web';

const startRuntime = vi.hoisted(() => vi.fn());
const register = vi.hoisted(() => vi.fn());

vi.mock('@chatic/runtime-web', async importOriginal => ({
    ...(await importOriginal<typeof RuntimeWeb>()),
    startRuntime,
}));
vi.mock('@chatic/runtime-react', async () =>
    (await import('@chatic/runtime-react/testing')).fakeRuntimeModule({
        session: { authFailureReaction: { register } },
    })
);

const env = () => undefined;

const load = async () => {
    vi.resetModules();
    return (await import('./landing')).startLandingRuntime;
};

describe('startLandingRuntime', { timeout: 30_000 }, () => {
    beforeEach(() => {
        startRuntime.mockReset();
        register.mockReset();
    });

    it('starts the runtime once however often it is called, and hands the guest sign-in on', async () => {
        const loginGuestByDevice = vi.fn(async () => ({ id: 'guest' }));
        startRuntime.mockResolvedValue({ engine: { commands: { loginGuestByDevice } } });
        const startLandingRuntime = await load();

        const [first, second] = await Promise.all([startLandingRuntime(env), startLandingRuntime(env)]);

        expect(first).toBe(second);
        expect(startRuntime).toHaveBeenCalledTimes(1);
        expect(startRuntime.mock.calls[0]?.[0]).toMatchObject({ name: 'landing' });
        await expect(first.loginGuest('device-1')).resolves.toEqual({ id: 'guest' });
        expect(loginGuestByDevice).toHaveBeenCalledWith('device-1');
    });

    it("switches the runtime's session-failure answer off after the start", async () => {
        startRuntime.mockResolvedValue({ engine: { commands: { loginGuestByDevice: vi.fn() } } });
        const startLandingRuntime = await load();

        await startLandingRuntime(env);

        expect(register).toHaveBeenCalledTimes(1);
        const [reaction] = register.mock.calls[0] as [() => unknown];
        expect(reaction()).toBeUndefined();
    });

    it('fails, and keeps failing, when the start built no engine', async () => {
        startRuntime.mockResolvedValue({ engine: null });
        const startLandingRuntime = await load();

        await expect(startLandingRuntime(env)).rejects.toThrow('without an engine');
        await expect(startLandingRuntime(env)).rejects.toThrow('without an engine');
        expect(startRuntime).toHaveBeenCalledTimes(1);
        expect(register).not.toHaveBeenCalled();
    });
});
