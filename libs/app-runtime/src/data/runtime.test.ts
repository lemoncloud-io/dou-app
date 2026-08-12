/**
 * Pre-boot cache option registration: both spellings — configureDataRuntime's cache options and
 * the deprecated setChatCacheLimit shim desktop-web still calls — must land in the DataManager
 * constructor, and only before the singleton is created (a late call is ignored, not applied to
 * already-built storages).
 */
jest.mock('@chatic/bridges', () => ({ logger: { warn: jest.fn() } }));
jest.mock('./DataManager', () => ({
    DataManager: jest.fn().mockImplementation(() => ({ getRepositories: () => ({}) })),
}));

describe('data runtime cache options', () => {
    const loadRuntime = async () => {
        jest.resetModules();
        const runtime = await import('./runtime');
        const { DataManager } = await import('./DataManager');
        return { ...runtime, DataManagerMock: DataManager as unknown as jest.Mock };
    };

    it('passes setChatCacheLimit through to the DataManager (deprecated shim path)', async () => {
        const { setChatCacheLimit, getDataRuntime, DataManagerMock } = await loadRuntime();

        setChatCacheLimit(1000);
        getDataRuntime();

        expect(DataManagerMock).toHaveBeenCalledWith(undefined, undefined, { maxChatsPerChannel: 1000 });
    });

    it('passes configureDataRuntime cache options through identically (canonical path)', async () => {
        const { configureDataRuntime, getDataRuntime, DataManagerMock } = await loadRuntime();
        const repositoryOptions = { some: 'policy' } as never;

        configureDataRuntime(repositoryOptions, { maxChatsPerChannel: 1000 });
        getDataRuntime();

        expect(DataManagerMock).toHaveBeenCalledWith(undefined, repositoryOptions, { maxChatsPerChannel: 1000 });
    });

    it('ignores a late registration instead of rebuilding shared state', async () => {
        const { setChatCacheLimit, getDataRuntime, DataManagerMock } = await loadRuntime();

        getDataRuntime();
        setChatCacheLimit(1000);
        getDataRuntime();

        expect(DataManagerMock).toHaveBeenCalledTimes(1);
        expect(DataManagerMock).toHaveBeenCalledWith(undefined, undefined, undefined);
    });
});
