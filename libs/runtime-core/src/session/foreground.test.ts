import type * as ForegroundModule from './foreground';

describe('foregroundPlatform', () => {
    // A fresh module per case: the holder is a module singleton, and the first case needs it unconfigured.
    const load = (): typeof ForegroundModule => {
        let loaded: typeof ForegroundModule | undefined;
        jest.isolateModules(() => {
            loaded = jest.requireActual<typeof ForegroundModule>('./foreground');
        });
        return loaded as typeof ForegroundModule;
    };

    it('throws when read before the entry point configured it — there is no default', () => {
        expect(() => load().foregroundPlatform.ports()).toThrow(/initAppRuntime/);
    });

    it('hands back the signal it was last configured with', () => {
        const { foregroundPlatform } = load();
        const first = { read: () => true, subscribe: () => () => undefined };
        const second = { read: () => false, subscribe: () => () => undefined };

        foregroundPlatform.configure(first);
        foregroundPlatform.configure(second);

        expect(foregroundPlatform.ports()).toBe(second);
    });
});
