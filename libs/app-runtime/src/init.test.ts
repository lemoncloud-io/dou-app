/**
 * The boot contract. What is worth testing here is not that `initAppRuntime` calls three functions —
 * it is the two things that changed when the import side effects were removed:
 *
 *  1. A session read WITHOUT the call fails loudly and names the fix. Before, importing the session
 *     barrel wired the resolvers, so this state was unreachable; now it is reachable and its failure
 *     mode is the whole safety story.
 *  2. The call is what makes the session readable — nothing else does.
 *
 * Every case reloads the modules: the resolvers and the boot flag are module state, so a case that
 * inherited a previous one's would be testing the wrong tree.
 */
// The spy is held OUTSIDE the factory (hence the `mock` prefix jest requires) so it survives
// `resetModules`: the factory re-runs per reload, and a reference captured from the module would
// point at the previous run's object.
const mockWarn = jest.fn();
jest.mock('@chatic/bridges', () => ({
    logger: { warn: mockWarn, info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const load = async () => {
    jest.resetModules();
    const init = await import('./init');
    // Reached through the store barrel, the way a consumer reads it — not the raw store file.
    const store = await import('./session/store');
    return { ...init, ...store };
};

describe('initAppRuntime', () => {
    beforeEach(() => {
        mockWarn.mockClear();
    });

    it('reading the session before boot throws, and the error names the fix', async () => {
        const { getActiveServerContext } = await load();

        // relayStore's resolvers are unset, and it refuses to guess: an empty host would produce
        // requests against '' instead of a diagnosable failure.
        expect(() => getActiveServerContext()).toThrow(/initAppRuntime/);
    });

    it('boots the session store — the same read succeeds afterwards', async () => {
        const { initAppRuntime, getActiveServerContext } = await load();

        initAppRuntime();

        expect(() => getActiveServerContext()).not.toThrow();
    });

    it('forwards data policies to the data runtime', async () => {
        jest.resetModules();
        const configureDataRuntime = jest.fn();
        jest.doMock('./data/runtime', () => ({ configureDataRuntime }));
        const { initAppRuntime } = await import('./init');

        const data = { cache: { maxChatsPerChannel: 1000 } };
        initAppRuntime({ data });

        expect(configureDataRuntime).toHaveBeenCalledWith(data);
    });

    it('registers nothing with the data runtime when no policy is given', async () => {
        jest.resetModules();
        const configureDataRuntime = jest.fn();
        jest.doMock('./data/runtime', () => ({ configureDataRuntime }));
        const { initAppRuntime } = await import('./init');

        initAppRuntime();

        // Passing `{}` through would trip the runtime's own late-registration warning for nothing.
        expect(configureDataRuntime).not.toHaveBeenCalled();
    });

    it('is safe to call twice, and says so — a duplicate boot means two owners', async () => {
        const { initAppRuntime, getActiveServerContext } = await load();

        initAppRuntime();
        initAppRuntime();

        expect(mockWarn).toHaveBeenCalledWith('WEB_CORE', expect.stringContaining('more than once'));
        // The wiring is assignment, not accumulation: the second call leaves a working runtime.
        expect(() => getActiveServerContext()).not.toThrow();
    });

    it('does not warn on the first call', async () => {
        const { initAppRuntime } = await load();

        initAppRuntime();

        expect(mockWarn).not.toHaveBeenCalled();
    });
});
