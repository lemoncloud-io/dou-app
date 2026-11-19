/**
 * `startLandingRuntime` is what the account surface's HTTP port awaits: one start per page, the session
 * failure answer switched off once it is up, and the guest sign-in handed back from the started engine.
 */
import type * as RuntimeWeb from '@chatic/runtime-web';

const startRuntime = vi.hoisted(() => vi.fn());
const register = vi.hoisted(() => vi.fn());

vi.mock('@chatic/runtime-web', async importOriginal => ({
    ...(await importOriginal<typeof RuntimeWeb>()),
    startRuntime,
}));
vi.mock('@chatic/runtime', async () =>
    (await import('@chatic/runtime/testing')).fakeRuntimeModule({ session: { authFailureReaction: { register } } })
);

const env = () => undefined;

/** A fresh module, so each case starts with no start remembered. */
const load = async () => {
    vi.resetModules();
    return (await import('./landing')).startLandingRuntime;
};

// Each test resets modules and imports the subject again, which evaluates the real runtime graph
// behind `fakeRuntimeModule` every time (about 2 s alone). Under a parallel run that passes the
// default 5 s, so the suite gets room rather than a flaky timeout.
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
