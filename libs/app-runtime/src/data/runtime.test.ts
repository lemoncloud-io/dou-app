/**
 * Pre-boot policy registration: `configureDataRuntime` is the only way an app injects repository
 * and cache-assembly options, and it only lands before the singleton exists — a late call is
 * ignored, not applied to already-built repositories and storages.
 */
jest.mock('@chatic/bridges', () => ({ logger: { warn: jest.fn() } }));
jest.mock('./DataManager', () => ({
    DataManager: jest.fn().mockImplementation(() => ({ getRepositories: () => ({}) })),
}));

describe('data runtime configuration', () => {
    const loadRuntime = async () => {
        jest.resetModules();
        const runtime = await import('./runtime');
        const { DataManager } = await import('./DataManager');
        return { ...runtime, DataManagerMock: DataManager as unknown as jest.Mock };
    };

    it('passes cache options through to the DataManager', async () => {
        const { configureDataRuntime, getDataRuntime, DataManagerMock } = await loadRuntime();

        configureDataRuntime({ cache: { maxChatsPerChannel: 1000 } });
        getDataRuntime();

        expect(DataManagerMock).toHaveBeenCalledWith(undefined, undefined, { maxChatsPerChannel: 1000 });
    });

    it('passes repository options through to the DataManager', async () => {
        const { configureDataRuntime, getDataRuntime, DataManagerMock } = await loadRuntime();
        const repositories = { some: 'policy' } as never;

        configureDataRuntime({ repositories });
        getDataRuntime();

        expect(DataManagerMock).toHaveBeenCalledWith(undefined, repositories, undefined);
    });

    // Apps register the two policy kinds from different places, so a second call must not wipe the
    // first — the runtime is built once from whatever accumulated.
    it('merges across calls instead of replacing', async () => {
        const { configureDataRuntime, getDataRuntime, DataManagerMock } = await loadRuntime();
        const repositories = { some: 'policy' } as never;

        configureDataRuntime({ repositories });
        configureDataRuntime({ cache: { maxChatsPerChannel: 1000 } });
        getDataRuntime();

        expect(DataManagerMock).toHaveBeenCalledWith(undefined, repositories, { maxChatsPerChannel: 1000 });
    });

    it('ignores a late registration instead of rebuilding shared state', async () => {
        const { configureDataRuntime, getDataRuntime, DataManagerMock } = await loadRuntime();

        getDataRuntime();
        configureDataRuntime({ cache: { maxChatsPerChannel: 1000 } });
        getDataRuntime();

        expect(DataManagerMock).toHaveBeenCalledTimes(1);
        expect(DataManagerMock).toHaveBeenCalledWith(undefined, undefined, undefined);
    });
});
