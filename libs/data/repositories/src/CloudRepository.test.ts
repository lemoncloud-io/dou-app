import { CloudRepository } from './CloudRepository';
import type { DomainMiniApp } from '@chatic/data-model';

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

const createSocketDataSource = () => ({
    getCloud: jest.fn(),
    updateCloud: jest.fn(),
});

const contextProvider = {
    getContext: () => ({ cid: 'cloud-a', sid: 'site-1', uid: 'me' }),
    setContext: () => undefined,
};

describe('CloudRepository', () => {
    it('returns a stable empty local result when no clouds are cached yet', async () => {
        const local = createLocalDataSource();
        const repository = new CloudRepository(createSocketDataSource() as any, local as any, contextProvider);

        const result = await repository.cacheReadList();

        expect(result).toEqual({ list: [], meta: { total: 0, source: 'local' } });
    });

    it('delegates cache helpers to the local datasource with the bound context', async () => {
        const local = createLocalDataSource();
        const repository = new CloudRepository(createSocketDataSource() as any, local as any, contextProvider);

        await repository.cacheRead('cloud-1');
        await repository.cacheWrite({ id: 'cloud-1' } as any);
        await repository.cacheClear();

        expect(local.cacheClear).toHaveBeenCalledWith({ cid: 'cloud-a', sid: 'site-1', uid: 'me' });
    });

    it('mirrors a remote get into the local cache', async () => {
        const local = createLocalDataSource();
        const remote = createSocketDataSource();
        remote.getCloud.mockResolvedValue({ id: 'cloud-1', name: 'Cloud One' });
        const repository = new CloudRepository(remote as any, local as any, contextProvider);

        const result = await repository.getCloud({ cid: 'cloud-1' } as any);

        expect(remote.getCloud).toHaveBeenCalledWith({ cid: 'cloud-1' }, expect.anything());
        expect(local.cacheWrite).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'cloud-1', name: 'Cloud One' }),
            expect.anything()
        );
        expect(result.id).toBe('cloud-1');
    });

    it('reads a cloud without touching the cache when asked not to cache it', async () => {
        const local = createLocalDataSource();
        const remote = createSocketDataSource();
        remote.getCloud.mockResolvedValue({ id: 'cloud-1', name: 'Cloud One' });
        const repository = new CloudRepository(remote as any, local as any, contextProvider);

        const result = await repository.getCloud({ id: 'cloud-1' } as any, { cache: false });

        expect(result.name).toBe('Cloud One');
        expect(local.cacheRead).not.toHaveBeenCalled();
        expect(local.cacheWrite).not.toHaveBeenCalled();
    });

    it('optimistically writes the edit, then rolls back when the remote update fails', async () => {
        const local = createLocalDataSource();
        local.cacheRead.mockResolvedValue({ id: 'cloud-1', name: 'Old' });
        const remote = createSocketDataSource();
        remote.updateCloud.mockRejectedValue(new Error('boom'));
        const repository = new CloudRepository(remote as any, local as any, contextProvider);

        await expect(repository.updateCloud({ id: 'cloud-1', name: 'New' } as any)).rejects.toThrow('boom');

        expect(local.cacheWrite).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ id: 'cloud-1', name: 'New' }),
            expect.anything()
        );
        expect(local.cacheWrite).toHaveBeenLastCalledWith({ id: 'cloud-1', name: 'Old' }, expect.anything());
    });

    it('reflects the edit in the cache optimistically before the server responds', async () => {
        const local = createLocalDataSource();
        local.cacheRead.mockResolvedValue({ id: 'cloud-1', cid: 'cloud-1', name: 'Old', cloudType: 'owner' });
        const remote = createSocketDataSource();
        let resolveUpdate: (value: unknown) => void = () => undefined;
        remote.updateCloud.mockReturnValue(new Promise(resolve => (resolveUpdate = resolve)));
        const repository = new CloudRepository(remote as any, local as any, contextProvider);

        const pending = repository.updateCloud({ id: 'cloud-1', name: 'New' } as any);
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
        const remote = createSocketDataSource();
        remote.updateCloud.mockResolvedValue({ id: 'cloud-1', name: 'New' });
        const repository = new CloudRepository(remote as any, local as any, contextProvider);

        await repository.updateCloud({ id: 'cloud-1', name: 'New' } as any);

        expect(local.cacheWrite).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ id: 'cloud-1', name: 'New', cloudType: 'invited' }),
            expect.anything()
        );
    });

    it('types a freshly mirrored subscription cloud as owner (not the invited default)', async () => {
        const local = createLocalDataSource();
        local.cacheRead.mockResolvedValue(null);
        const remote = createSocketDataSource();
        remote.getCloud.mockResolvedValue({ id: 'cloud-1', name: 'Cloud One' });
        const repository = new CloudRepository(remote as any, local as any, contextProvider);

        await repository.getCloud({ id: 'cloud-1' } as any);

        expect(local.cacheWrite).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'cloud-1', name: 'Cloud One', cloudType: 'owner' }),
            expect.anything()
        );
    });

    it('preserves an existing invited type when mirroring a get', async () => {
        const local = createLocalDataSource();
        local.cacheRead.mockResolvedValue({ id: 'cloud-1', cid: 'cloud-1', name: 'Old', cloudType: 'invited' });
        const remote = createSocketDataSource();
        remote.getCloud.mockResolvedValue({ id: 'cloud-1', name: 'Fresh' });
        const repository = new CloudRepository(remote as any, local as any, contextProvider);

        await repository.getCloud({ id: 'cloud-1' } as any);

        expect(local.cacheWrite).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'cloud-1', name: 'Fresh', cloudType: 'invited' }),
            expect.anything()
        );
    });

    it('persists the authoritative name into the cache on a successful update', async () => {
        const local = createLocalDataSource();
        local.cacheRead.mockResolvedValue(null);
        const remote = createSocketDataSource();
        remote.updateCloud.mockResolvedValue({ id: 'cloud-1', name: 'New' });
        const repository = new CloudRepository(remote as any, local as any, contextProvider);

        await repository.updateCloud({ id: 'cloud-1', name: 'New' } as any);

        expect(local.cacheWrite).toHaveBeenLastCalledWith(
            expect.objectContaining({ id: 'cloud-1', name: 'New', cloudType: 'owner' }),
            expect.anything()
        );
    });

    it('keeps the renamed cloud its own cid when another cloud is active', async () => {
        const local = createLocalDataSource();
        local.cacheRead.mockResolvedValue(null);
        const remote = createSocketDataSource();
        remote.updateCloud.mockResolvedValue({ id: 'cloud-1', cid: 'cloud-a', name: 'New' });
        const repository = new CloudRepository(remote as any, local as any, contextProvider);

        await repository.updateCloud({ id: 'cloud-1', name: 'New' } as any);

        expect(local.cacheWrite).toHaveBeenLastCalledWith(
            expect.objectContaining({ id: 'cloud-1', cid: 'cloud-1' }),
            expect.anything()
        );
    });

    it('takes only the name from the relay view, so an invited row keeps its inviter', async () => {
        const local = createLocalDataSource();
        local.cacheRead.mockResolvedValue({
            id: 'cloud-1',
            cid: 'cloud-1',
            name: 'Old',
            cloudType: 'invited',
            owner$: { id: 'inviter', name: 'Mina' },
        });
        const remote = createSocketDataSource();
        remote.getCloud.mockResolvedValue({
            id: 'cloud-1',
            name: 'Fresh',
            ownerId: 'owner',
            owner$: { id: 'owner', name: 'owner@example.com' },
            email: 'owner@example.com',
        });
        const repository = new CloudRepository(remote as any, local as any, contextProvider);

        await repository.getCloud({ id: 'cloud-1' } as any);

        expect(local.cacheWrite).toHaveBeenCalledWith(
            { id: 'cloud-1', cid: 'cloud-1', name: 'Fresh', cloudType: 'invited' },
            expect.anything()
        );
    });

    it('keeps the cached name when the answer carries none', async () => {
        const local = createLocalDataSource();
        local.cacheRead.mockResolvedValue({ id: 'cloud-1', cid: 'cloud-1', name: 'Kept', cloudType: 'owner' });
        const remote = createSocketDataSource();
        remote.getCloud.mockResolvedValue({ id: 'cloud-1' });
        const repository = new CloudRepository(remote as any, local as any, contextProvider);

        await repository.getCloud({ id: 'cloud-1' } as any);

        expect(local.cacheWrite).toHaveBeenCalledWith(
            { id: 'cloud-1', cid: 'cloud-1', cloudType: 'owner' },
            expect.anything()
        );
    });

    it('keeps an existing row its cid when mirroring a get made from another cloud', async () => {
        const local = createLocalDataSource();
        local.cacheRead.mockResolvedValue({ id: 'cloud-1', cid: 'cloud-1', name: 'Old', cloudType: 'invited' });
        const remote = createSocketDataSource();
        remote.getCloud.mockResolvedValue({ id: 'cloud-1', cid: 'cloud-a', name: 'Fresh' });
        const repository = new CloudRepository(remote as any, local as any, contextProvider);

        await repository.getCloud({ id: 'cloud-1' } as any);

        expect(local.cacheWrite).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'cloud-1', cid: 'cloud-1', name: 'Fresh' }),
            expect.anything()
        );
    });
});

describe('CloudRepository — HTTP catalog surface (ADR-0070 late stage 2)', () => {
    const createHttpDataSource = () => ({
        listClouds: jest.fn(),
        updateCloud: jest.fn(),
        makeCloud: jest.fn(),
        releaseCloud: jest.fn(),
        retryCloudSetup: jest.fn(),
        verifyEmail: jest.fn(),
        fetchMiniAppUrl: jest.fn(),
        saveMiniAppUrl: jest.fn(),
    });

    it('throws a clear error when ICloudHttpDataSource is not injected', async () => {
        const repository = new CloudRepository(
            createSocketDataSource() as any,
            createLocalDataSource() as any,
            contextProvider
        );

        await expect(repository.fetchCloudCatalog()).rejects.toThrow('not injected');
        await expect(repository.makeCloud({} as any)).rejects.toThrow('not injected');
        await expect(repository.releaseCloud('c1')).rejects.toThrow('not injected');
        await expect(repository.retryCloudSetup('c1')).rejects.toThrow('not injected');
        await expect(repository.verifyCloudEmail({} as any)).rejects.toThrow('not injected');
        await expect(repository.fetchMiniAppUrl('c1')).rejects.toThrow('not injected');
        await expect(repository.saveMiniAppUrl('c1', '')).rejects.toThrow('not injected');
    });

    it('delegates to the injected http data source and never touches the local cache', async () => {
        const http = createHttpDataSource();
        http.listClouds.mockResolvedValue({ list: [{ id: 'c1' }], meta: { total: 1, source: 'remote' } });
        const local = createLocalDataSource();
        const repository = new CloudRepository(
            createSocketDataSource() as any,
            local as any,
            contextProvider,
            http as any
        );

        const result = await repository.fetchCloudCatalog({ page: 1 });

        expect(http.listClouds).toHaveBeenCalledWith({ page: 1 }, expect.anything());
        expect(result.list).toEqual([{ id: 'c1' }]);
        expect(local.cacheWrite).not.toHaveBeenCalled();
        expect(local.cacheWriteMany).not.toHaveBeenCalled();
    });

    it('retryCloudSetup — delegates with the request context and leaves the local cache alone', async () => {
        const http = createHttpDataSource();
        http.retryCloudSetup.mockResolvedValue({ id: 'c1', status: 'reserved' });
        const local = createLocalDataSource();
        const repository = new CloudRepository(
            createSocketDataSource() as any,
            local as any,
            contextProvider,
            http as any
        );

        await expect(repository.retryCloudSetup('c1')).resolves.toEqual({ id: 'c1', status: 'reserved' });

        expect(http.retryCloudSetup).toHaveBeenCalledWith('c1', expect.anything());
        expect(local.cacheWrite).not.toHaveBeenCalled();
    });
    it('mini app link — read and saved over http, never through the local cache', async () => {
        const http = createHttpDataSource();
        http.fetchMiniAppUrl.mockResolvedValue('https://shop.example/');
        http.saveMiniAppUrl.mockResolvedValue('');
        const local = createLocalDataSource();
        const repository = new CloudRepository(
            createSocketDataSource() as any,
            local as any,
            contextProvider,
            http as any
        );

        await expect(repository.fetchMiniAppUrl('c1')).resolves.toBe('https://shop.example/');
        await expect(repository.saveMiniAppUrl('c1', '')).resolves.toBe('');

        expect(http.fetchMiniAppUrl).toHaveBeenCalledWith('c1');
        expect(http.saveMiniAppUrl).toHaveBeenCalledWith('c1', '');
        expect(local.cacheWrite).not.toHaveBeenCalled();
    });
});

describe('CloudRepository — mini app list', () => {
    const createMiniAppSocketDataSource = () => ({
        listMiniApps: jest.fn(),
        addMiniApp: jest.fn(),
        updateMiniApp: jest.fn(),
        removeMiniApp: jest.fn(),
    });

    it('throws a clear error when IMiniAppSocketDataSource is not injected', async () => {
        const repository = new CloudRepository(
            createSocketDataSource() as any,
            createLocalDataSource() as any,
            contextProvider,
            {} as any
        );

        await expect(repository.listMiniApps('c1')).rejects.toThrow('not injected');
        await expect(repository.addMiniApp('c1', { name: 'n', url: 'u' })).rejects.toThrow('not injected');
        await expect(repository.updateMiniApp('m1', { enabled: false })).rejects.toThrow('not injected');
        await expect(repository.removeMiniApp('m1')).rejects.toThrow('not injected');
    });

    it('hands the arguments through, drops the cloud id the socket already routes by, and never touches the local cache', async () => {
        const miniApps = createMiniAppSocketDataSource();
        const app: DomainMiniApp = {
            id: 'm1',
            name: 'Shop',
            url: 'https://shop.example/',
            enabled: true,
            status: 'active',
        };
        miniApps.listMiniApps.mockResolvedValue([app]);
        miniApps.addMiniApp.mockResolvedValue(app);
        miniApps.updateMiniApp.mockResolvedValue({ ...app, enabled: false, status: 'inactive' });
        miniApps.removeMiniApp.mockResolvedValue(undefined);
        const local = createLocalDataSource();
        const repository = new CloudRepository(
            createSocketDataSource() as any,
            local as any,
            contextProvider,
            undefined,
            miniApps
        );

        await expect(repository.listMiniApps('c1')).resolves.toEqual([app]);
        await expect(repository.addMiniApp('c1', { name: 'Shop', url: 'https://shop.example/' })).resolves.toBe(app);
        await expect(repository.updateMiniApp('m1', { enabled: false })).resolves.toMatchObject({ status: 'inactive' });
        await expect(repository.removeMiniApp('m1')).resolves.toBeUndefined();

        expect(miniApps.listMiniApps).toHaveBeenCalledWith();
        expect(miniApps.addMiniApp).toHaveBeenCalledWith({ name: 'Shop', url: 'https://shop.example/' });
        expect(miniApps.updateMiniApp).toHaveBeenCalledWith('m1', { enabled: false });
        expect(miniApps.removeMiniApp).toHaveBeenCalledWith('m1');
        expect(local.cacheWrite).not.toHaveBeenCalled();
    });
});
