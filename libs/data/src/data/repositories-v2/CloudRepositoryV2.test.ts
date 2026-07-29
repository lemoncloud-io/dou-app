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

    it('optimistically writes the edit, then rolls back when the remote update fails', async () => {
        const local = createLocalDataSource();
        local.cacheRead.mockResolvedValue({ id: 'cloud-1', name: 'Old' });
        const remote = createRemoteDataSource();
        remote.updateCloud.mockRejectedValue(new Error('boom'));
        const repository = new CloudRepositoryV2(remote as any, local as any, contextProvider);

        await expect(repository.updateCloud({ id: 'cloud-1', name: 'New' } as any)).rejects.toThrow('boom');

        // First: the optimistic write applies the new name to the cache.
        expect(local.cacheWrite).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ id: 'cloud-1', name: 'New' }),
            expect.anything()
        );
        // Last: the failure restores the previously cached snapshot exactly.
        expect(local.cacheWrite).toHaveBeenLastCalledWith({ id: 'cloud-1', name: 'Old' }, expect.anything());
    });

    it('reflects the edit in the cache optimistically before the server responds', async () => {
        const local = createLocalDataSource();
        local.cacheRead.mockResolvedValue({ id: 'cloud-1', cid: 'cloud-1', name: 'Old', cloudType: 'owner' });
        const remote = createRemoteDataSource();
        let resolveUpdate: (value: unknown) => void = () => undefined;
        remote.updateCloud.mockReturnValue(new Promise(resolve => (resolveUpdate = resolve)));
        const repository = new CloudRepositoryV2(remote as any, local as any, contextProvider);

        const pending = repository.updateCloud({ id: 'cloud-1', name: 'New' } as any);
        // Flush microtasks so the optimistic write lands while the remote call is still in flight.
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(remote.updateCloud).toHaveBeenCalled();
        expect(local.cacheWrite).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'cloud-1', name: 'New', cloudType: 'owner' }),
            expect.anything()
        );

        resolveUpdate({ id: 'cloud-1', name: 'New' });
        await pending;
    });

    it('keeps an invited cloud invited on an optimistic edit', async () => {
        const local = createLocalDataSource();
        local.cacheRead.mockResolvedValue({ id: 'cloud-1', cid: 'cloud-1', name: 'Old', cloudType: 'invited' });
        const remote = createRemoteDataSource();
        remote.updateCloud.mockResolvedValue({ id: 'cloud-1', name: 'New' });
        const repository = new CloudRepositoryV2(remote as any, local as any, contextProvider);

        await repository.updateCloud({ id: 'cloud-1', name: 'New' } as any);

        // The optimistic write must not downgrade an invited cloud to the 'owner' default.
        expect(local.cacheWrite).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ id: 'cloud-1', name: 'New', cloudType: 'invited' }),
            expect.anything()
        );
    });

    it('types a freshly mirrored subscription cloud as owner (not the invited default)', async () => {
        const local = createLocalDataSource();
        local.cacheRead.mockResolvedValue(null);
        const remote = createRemoteDataSource();
        remote.getCloud.mockResolvedValue({ id: 'cloud-1', name: 'Cloud One' });
        const repository = new CloudRepositoryV2(remote as any, local as any, contextProvider);

        await repository.getCloud({ id: 'cloud-1' } as any);

        // A new cloud reached via the command path is an owned/subscription cloud, so it must not
        // fall back to the local source's 'invited' default (which would pollute useInvitedClouds).
        expect(local.cacheWrite).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'cloud-1', name: 'Cloud One', cloudType: 'owner' }),
            expect.anything()
        );
    });

    it('preserves an existing invited type when mirroring a get', async () => {
        const local = createLocalDataSource();
        local.cacheRead.mockResolvedValue({ id: 'cloud-1', cid: 'cloud-1', name: 'Old', cloudType: 'invited' });
        const remote = createRemoteDataSource();
        remote.getCloud.mockResolvedValue({ id: 'cloud-1', name: 'Fresh' });
        const repository = new CloudRepositoryV2(remote as any, local as any, contextProvider);

        await repository.getCloud({ id: 'cloud-1' } as any);

        // An invited cloud (seeded by the invited-cloud flow) keeps its type across a name refresh.
        expect(local.cacheWrite).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'cloud-1', name: 'Fresh', cloudType: 'invited' }),
            expect.anything()
        );
    });

    it('persists the authoritative name into the cache on a successful update', async () => {
        const local = createLocalDataSource();
        local.cacheRead.mockResolvedValue(null);
        const remote = createRemoteDataSource();
        remote.updateCloud.mockResolvedValue({ id: 'cloud-1', name: 'New' });
        const repository = new CloudRepositoryV2(remote as any, local as any, contextProvider);

        await repository.updateCloud({ id: 'cloud-1', name: 'New' } as any);

        expect(local.cacheWrite).toHaveBeenLastCalledWith(
            expect.objectContaining({ id: 'cloud-1', name: 'New', cloudType: 'owner' }),
            expect.anything()
        );
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
