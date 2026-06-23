import { CloudRepositoryV2 } from './CloudRepositoryV2';

const createLocalDataSource = () => ({
    observeList: jest.fn(() => () => undefined),
    observeItem: jest.fn(() => () => undefined),
    cacheRead: jest.fn(),
    cacheReadList: jest.fn().mockResolvedValue(null),
    cacheWrite: jest.fn(),
    cacheWriteMany: jest.fn(),
    cacheDelete: jest.fn(),
    cacheClear: jest.fn(),
});

const createRemoteDataSource = () => ({
    getCloud: jest.fn(),
    updateCloud: jest.fn(),
    deleteCloud: jest.fn(),
});

const contextProvider = {
    getContext: () => ({ cid: 'cloud-a', sid: 'site-1', uid: 'me' }),
    setContext: () => undefined,
};

describe('CloudRepositoryV2', () => {
    it('returns a stable empty local result when no clouds are cached yet', async () => {
        const local = createLocalDataSource();
        const repository = new CloudRepositoryV2(createRemoteDataSource() as any, local as any, contextProvider);

        const result = await repository.cacheReadList();

        // The local-first repository should still expose a stable empty list contract.
        expect(result).toEqual({ list: [], meta: { total: 0, source: 'local' } });
    });

    it('delegates cache helpers to the local datasource with the bound context', async () => {
        const local = createLocalDataSource();
        const repository = new CloudRepositoryV2(createRemoteDataSource() as any, local as any, contextProvider);

        await repository.cacheRead('cloud-1');
        await repository.cacheWrite({ id: 'cloud-1' } as any);
        await repository.cacheClear();

        expect(local.cacheClear).toHaveBeenCalledWith({ cid: 'cloud-a', sid: 'site-1', uid: 'me' });
    });

    it('mirrors a remote get into the local cache', async () => {
        const local = createLocalDataSource();
        const remote = createRemoteDataSource();
        remote.getCloud.mockResolvedValue({ id: 'cloud-1', name: 'Cloud One' });
        const repository = new CloudRepositoryV2(remote as any, local as any, contextProvider);

        const result = await repository.getCloud({ cid: 'cloud-1' } as any);

        expect(remote.getCloud).toHaveBeenCalledWith({ cid: 'cloud-1' }, expect.anything());
        expect(local.cacheWrite).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'cloud-1', name: 'Cloud One' }),
            expect.anything()
        );
        expect(result.id).toBe('cloud-1');
    });

    it('rolls back the optimistic write when a remote update fails', async () => {
        const local = createLocalDataSource();
        local.cacheRead.mockResolvedValue({ id: 'cloud-1', name: 'Old' });
        const remote = createRemoteDataSource();
        remote.updateCloud.mockRejectedValue(new Error('boom'));
        const repository = new CloudRepositoryV2(remote as any, local as any, contextProvider);

        await expect(repository.updateCloud({ id: 'cloud-1', name: 'New' } as any)).rejects.toThrow('boom');

        // The last cacheWrite restores the previously cached snapshot.
        expect(local.cacheWrite).toHaveBeenLastCalledWith({ id: 'cloud-1', name: 'Old' }, expect.anything());
    });

    it('optimistically removes a cloud and restores it when the remote delete fails', async () => {
        const local = createLocalDataSource();
        local.cacheRead.mockResolvedValue({ id: 'cloud-1', name: 'Keep' });
        const remote = createRemoteDataSource();
        remote.deleteCloud.mockRejectedValue(new Error('nope'));
        const repository = new CloudRepositoryV2(remote as any, local as any, contextProvider);

        await expect(repository.deleteCloud({ id: 'cloud-1' } as any)).rejects.toThrow('nope');

        expect(local.cacheDelete).toHaveBeenCalledWith('cloud-1', expect.anything());
        expect(local.cacheWrite).toHaveBeenLastCalledWith({ id: 'cloud-1', name: 'Keep' }, expect.anything());
    });
});
