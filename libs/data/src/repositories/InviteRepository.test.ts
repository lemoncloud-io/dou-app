import { InviteRepository } from './InviteRepository';

describe('InviteRepository', () => {
    const makeLocalDataSourceMock = () => ({
        cacheRead: jest.fn().mockResolvedValue(null),
        cacheReadList: jest.fn().mockResolvedValue({ list: [], meta: { total: 0, source: 'local' } }),
        observeItem: jest.fn(),
        observeList: jest.fn().mockReturnValue(() => undefined),
        cacheWrite: jest.fn().mockResolvedValue(undefined),
        cacheWriteMany: jest.fn().mockResolvedValue(undefined),
        cacheDelete: jest.fn().mockResolvedValue(undefined),
        cacheDeleteMany: jest.fn().mockResolvedValue(undefined),
        cacheClear: jest.fn().mockResolvedValue(undefined),
    });

    const createRepository = (context: { cid?: string; uid?: string } = { cid: 'default', uid: 'me' }) => {
        const inviteSocketDataSource = {
            listInvites: jest.fn().mockResolvedValue([]),
            createInvite: jest.fn().mockResolvedValue({}),
            getInvite: jest.fn().mockResolvedValue({}),
            acceptInvite: jest.fn().mockResolvedValue({}),
            cancelInvite: jest.fn().mockResolvedValue({}),
            rejectInvite: jest.fn().mockResolvedValue({}),
        };
        const inviteLocalDataSource = makeLocalDataSourceMock();
        const contextProvider = {
            getContext: () => context,
            setContext: () => undefined,
        };
        const repository = new InviteRepository(
            inviteSocketDataSource as any,
            inviteLocalDataSource as any,
            contextProvider as any
        );

        return { repository, inviteSocketDataSource, inviteLocalDataSource };
    };

    it('list returns the remote result untouched', async () => {
        const { repository, inviteSocketDataSource } = createRepository();
        const invites = [{ id: 'invt-1' }, { id: 'invt-2' }];
        inviteSocketDataSource.listInvites.mockResolvedValue(invites);

        const result = await repository.list();

        expect(result).toBe(invites); // pass-through: the same reference — nothing is reordered or remapped
    });

    it('list delegates with null when there is no filter', async () => {
        const { repository, inviteSocketDataSource } = createRepository();

        await repository.list();

        expect(inviteSocketDataSource.listInvites).toHaveBeenCalledWith(null);
    });

    it('list passes the status filter straight through', async () => {
        const { repository, inviteSocketDataSource } = createRepository();

        await repository.list({ state: 'accepted' } as any);

        expect(inviteSocketDataSource.listInvites).toHaveBeenCalledWith({ state: 'accepted' });
    });

    it('create delegates the input as is and returns the issued view', async () => {
        const { repository, inviteSocketDataSource } = createRepository();
        const view = { id: 'invt-1', deeplink: 'https://x/s?code=y' };
        inviteSocketDataSource.createInvite.mockResolvedValue(view);

        const result = await repository.create({ phone: '01012345678', name: 'Hong Gildong' } as any);

        expect(inviteSocketDataSource.createInvite).toHaveBeenCalledWith({
            phone: '01012345678',
            name: 'Hong Gildong',
        });
        expect(result).toBe(view);
    });

    it('get delegates the code and preserves needVerify', async () => {
        const { repository, inviteSocketDataSource } = createRepository();
        inviteSocketDataSource.getInvite.mockResolvedValue({ id: 'invt-1', state: 'pending', needVerify: true });

        const result = await repository.get('invt:1:secret');

        expect(inviteSocketDataSource.getInvite).toHaveBeenCalledWith('invt:1:secret');
        expect(result).toEqual({ id: 'invt-1', state: 'pending', needVerify: true });
    });

    it('accept delegates the code and returns the acceptance view', async () => {
        const { repository, inviteSocketDataSource } = createRepository();
        inviteSocketDataSource.acceptInvite.mockResolvedValue({ id: 'invt-1', state: 'accepted' });

        const result = await repository.accept('invt:1:secret');

        expect(inviteSocketDataSource.acceptInvite).toHaveBeenCalledWith('invt:1:secret');
        expect(result).toEqual({ id: 'invt-1', state: 'accepted' });
    });

    it('cancel delegates the code and returns the terminal view', async () => {
        const { repository, inviteSocketDataSource } = createRepository();
        inviteSocketDataSource.cancelInvite.mockResolvedValue({ id: 'invt-1', state: 'canceled', canceledAt: 1 });

        const result = await repository.cancel('invt:1:secret');

        expect(inviteSocketDataSource.cancelInvite).toHaveBeenCalledWith('invt:1:secret');
        expect(result).toMatchObject({ state: 'canceled' });
    });

    it('reject delegates the code and returns the terminal view', async () => {
        const { repository, inviteSocketDataSource } = createRepository();
        inviteSocketDataSource.rejectInvite.mockResolvedValue({ id: 'invt-1', state: 'rejected', rejectedAt: 1 });

        const result = await repository.reject('invt:1:secret');

        expect(inviteSocketDataSource.rejectInvite).toHaveBeenCalledWith('invt:1:secret');
        expect(result).toMatchObject({ state: 'rejected' });
    });

    it('a remote failure is not swallowed but rejected as is (the caller branches on the error code)', async () => {
        const { repository, inviteSocketDataSource } = createRepository();
        const failure = new Error('403');
        inviteSocketDataSource.acceptInvite.mockRejectedValue(failure);

        await expect(repository.accept('invt:1:secret')).rejects.toBe(failure);
    });

    it('it goes through the cache, but every call still reaches remote (the cache is not authoritative)', async () => {
        const { repository, inviteSocketDataSource } = createRepository();

        await repository.list();
        await repository.list();

        // Acceptance happens on the other device and there is no notification packet — if the cache were authoritative you would only ever see a stale card.
        expect(inviteSocketDataSource.listInvites).toHaveBeenCalledTimes(2);
    });

    describe('cache mirroring for list (ADR-0052)', () => {
        it('on the default cloud the response is cached with credentials stripped', async () => {
            const { repository, inviteSocketDataSource, inviteLocalDataSource } = createRepository({
                cid: 'default',
                uid: 'me',
            });
            inviteSocketDataSource.listInvites.mockResolvedValue([
                { id: 'invt-1', state: 'pending', code: 'secret', deeplink: 'https://x/s?code=secret' },
            ]);

            await repository.list();

            expect(inviteLocalDataSource.cacheWriteMany).toHaveBeenCalledTimes(1);
            const [written] = inviteLocalDataSource.cacheWriteMany.mock.calls[0];
            expect(written).toEqual([expect.objectContaining({ id: 'invt-1', state: 'pending' })]);
            expect(written[0]).not.toHaveProperty('code');
            expect(written[0]).not.toHaveProperty('deeplink');
        });

        it('on an active cloud (cid !== default) it reads but does not cache', async () => {
            const { repository, inviteSocketDataSource, inviteLocalDataSource } = createRepository({
                cid: 'cloud-a',
                uid: 'me',
            });
            inviteSocketDataSource.listInvites.mockResolvedValue([{ id: 'invt-1', state: 'pending' }]);

            const result = await repository.list();

            expect(result).toEqual([{ id: 'invt-1', state: 'pending' }]);
            expect(inviteLocalDataSource.cacheWriteMany).not.toHaveBeenCalled();
        });

        it('the return value is still the original, code/deeplink included (the mapping applies to the storage path only)', async () => {
            const { repository, inviteSocketDataSource } = createRepository({ cid: 'default', uid: 'me' });
            const view = { id: 'invt-1', state: 'pending', code: 'secret', deeplink: 'https://x/s?code=secret' };
            inviteSocketDataSource.listInvites.mockResolvedValue([view]);

            const result = await repository.list();

            expect(result[0]).toBe(view);
            expect(result[0].code).toBe('secret');
        });
    });

    // If the only thing that fills the cache is the list mirror, the cache trails this device's own
    // actions by one round trip — an invite just issued is absent locally (a cold boot or offline
    // waiting screen comes up empty), and an invite just cancelled claims to be pending until the next
    // list. So every server answer about an invite I own is mirrored.
    describe('cache mirroring for command responses', () => {
        it('the create response is cached with credentials stripped (it does not wait for the next list)', async () => {
            const { repository, inviteSocketDataSource, inviteLocalDataSource } = createRepository({
                cid: 'default',
                uid: 'me',
            });
            const view = { id: 'invt-9', state: 'pending', code: 'secret', deeplink: 'https://x/s?code=secret' };
            inviteSocketDataSource.createInvite.mockResolvedValue(view);

            const result = await repository.create({} as any);

            const [written] = inviteLocalDataSource.cacheWriteMany.mock.calls[0];
            expect(written).toEqual([expect.objectContaining({ id: 'invt-9', state: 'pending' })]);
            expect(written[0]).not.toHaveProperty('code');
            expect(written[0]).not.toHaveProperty('deeplink');
            // The caller has to hand the deep link on, so the return value is the untouched original.
            expect(result).toBe(view);
        });

        it('the cancel response is cached so the cached row cannot keep claiming pending', async () => {
            const { repository, inviteSocketDataSource, inviteLocalDataSource } = createRepository({
                cid: 'default',
                uid: 'me',
            });
            inviteSocketDataSource.cancelInvite.mockResolvedValue({ id: 'invt-9', state: 'canceled', canceledAt: 7 });

            await repository.cancel('invt:invt-9:secret');

            const [written] = inviteLocalDataSource.cacheWriteMany.mock.calls[0];
            expect(written).toEqual([expect.objectContaining({ id: 'invt-9', state: 'canceled', canceledAt: 7 })]);
        });

        // This is a recipient-side command. The recipient's invite.list does not return that row (the
        // list holds the inviter's cards), so caching it would only create an orphan row nobody reads
        // again.
        it('accept/reject are not mirrored (recipient-side commands)', async () => {
            const { repository, inviteSocketDataSource, inviteLocalDataSource } = createRepository({
                cid: 'default',
                uid: 'me',
            });
            inviteSocketDataSource.acceptInvite.mockResolvedValue({ id: 'invt-9', state: 'accepted' });
            inviteSocketDataSource.rejectInvite.mockResolvedValue({ id: 'invt-8', state: 'rejected' });

            await repository.accept('invt:invt-9:secret');
            await repository.reject('invt:invt-8:secret');

            expect(inviteLocalDataSource.cacheWriteMany).not.toHaveBeenCalled();
        });

        it('on an active cloud (cid !== default) create does not cache either', async () => {
            const { repository, inviteSocketDataSource, inviteLocalDataSource } = createRepository({
                cid: 'cloud-a',
                uid: 'me',
            });
            inviteSocketDataSource.createInvite.mockResolvedValue({ id: 'invt-9', state: 'pending' });

            await repository.create({} as any);

            expect(inviteLocalDataSource.cacheWriteMany).not.toHaveBeenCalled();
        });

        // A response with no id would be stored under an empty-string id and collide with the next row
        // on the same key — rather than create a poisoning row, it is simply skipped.
        it('a response with no id is not cached', async () => {
            const { repository, inviteSocketDataSource, inviteLocalDataSource } = createRepository({
                cid: 'default',
                uid: 'me',
            });
            inviteSocketDataSource.listInvites.mockResolvedValue([{ state: 'pending' }, { id: 'invt-1' }]);

            await repository.list();

            const [written] = inviteLocalDataSource.cacheWriteMany.mock.calls[0];
            expect(written).toEqual([expect.objectContaining({ id: 'invt-1' })]);
        });
    });

    describe('local-only reads and writes', () => {
        it('cacheReadList delegates to the local data source', async () => {
            const { repository, inviteLocalDataSource } = createRepository();
            const listResult = { list: [{ id: 'i1' }], meta: { total: 1, source: 'local' as const } };
            inviteLocalDataSource.cacheReadList.mockResolvedValue(listResult);

            const result = await repository.cacheReadList();

            expect(result).toBe(listResult);
        });

        it('cacheReadList falls back to an empty result on null', async () => {
            const { repository, inviteLocalDataSource } = createRepository();
            inviteLocalDataSource.cacheReadList.mockResolvedValue(null);

            const result = await repository.cacheReadList();

            expect(result).toEqual({ list: [], meta: { total: 0, source: 'local' } });
        });

        it('observeList returns the unsubscribe from the local data source as is', () => {
            const { repository, inviteLocalDataSource } = createRepository();
            const unsubscribe = jest.fn();
            inviteLocalDataSource.observeList.mockReturnValue(unsubscribe);

            const cb = jest.fn();
            const result = repository.observeList(cb);

            expect(inviteLocalDataSource.observeList).toHaveBeenCalledWith(undefined, cb, expect.anything());
            expect(result).toBe(unsubscribe);
        });

        it('dismiss stamps dismissedAt with the current time', async () => {
            const { repository, inviteLocalDataSource } = createRepository();

            await repository.dismiss('invt-1');

            expect(inviteLocalDataSource.cacheWrite).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'invt-1', dismissedAt: expect.any(Number) }),
                expect.anything()
            );
        });

        it('undismiss clears dismissedAt', async () => {
            const { repository, inviteLocalDataSource } = createRepository();

            await repository.undismiss('invt-1');

            expect(inviteLocalDataSource.cacheWrite).toHaveBeenCalledWith(
                { id: 'invt-1', dismissedAt: undefined },
                expect.anything()
            );
        });

        it('cacheWriteMany delegates to the local data source (for seeding a migration stub)', async () => {
            const { repository, inviteLocalDataSource } = createRepository();
            const items = [{ id: 'stub-1', dismissedAt: 1 }];

            await repository.cacheWriteMany(items);

            expect(inviteLocalDataSource.cacheWriteMany).toHaveBeenCalledWith(items, expect.anything());
        });

        it('cacheDelete delegates to the local data source (for draining a reconcile)', async () => {
            const { repository, inviteLocalDataSource } = createRepository();

            await repository.cacheDelete('stub-1');

            expect(inviteLocalDataSource.cacheDelete).toHaveBeenCalledWith('stub-1', expect.anything());
        });

        it('cacheWrite (single) delegates to the local data source (for the debug panel)', async () => {
            const { repository, inviteLocalDataSource } = createRepository();
            const item = { id: 'dbg-1', name: 'Debug Invite' };

            await repository.cacheWrite(item);

            expect(inviteLocalDataSource.cacheWrite).toHaveBeenCalledWith(item, expect.anything());
        });

        it('cacheClear delegates to the local data source (for the debug panel)', async () => {
            const { repository, inviteLocalDataSource } = createRepository();

            await repository.cacheClear();

            expect(inviteLocalDataSource.cacheClear).toHaveBeenCalledWith(expect.anything());
        });
    });

    describe('on an active cloud (cid !== default) every local write is skipped', () => {
        it('dismiss writes nothing', async () => {
            const { repository, inviteLocalDataSource } = createRepository({ cid: 'cloud-a', uid: 'me' });

            await repository.dismiss('invt-1');

            expect(inviteLocalDataSource.cacheWrite).not.toHaveBeenCalled();
        });

        it('undismiss writes nothing', async () => {
            const { repository, inviteLocalDataSource } = createRepository({ cid: 'cloud-a', uid: 'me' });

            await repository.undismiss('invt-1');

            expect(inviteLocalDataSource.cacheWrite).not.toHaveBeenCalled();
        });

        it('cacheWriteMany writes nothing (keeping a migration from running on another cloud)', async () => {
            const { repository, inviteLocalDataSource } = createRepository({ cid: 'cloud-a', uid: 'me' });

            await repository.cacheWriteMany([{ id: 'stub-1', dismissedAt: 1 }]);

            expect(inviteLocalDataSource.cacheWriteMany).not.toHaveBeenCalled();
        });

        it('cacheDelete deletes nothing', async () => {
            const { repository, inviteLocalDataSource } = createRepository({ cid: 'cloud-a', uid: 'me' });

            await repository.cacheDelete('stub-1');

            expect(inviteLocalDataSource.cacheDelete).not.toHaveBeenCalled();
        });

        it('cacheWrite (single) writes nothing', async () => {
            const { repository, inviteLocalDataSource } = createRepository({ cid: 'cloud-a', uid: 'me' });

            await repository.cacheWrite({ id: 'dbg-1' });

            expect(inviteLocalDataSource.cacheWrite).not.toHaveBeenCalled();
        });

        it('cacheClear deletes nothing', async () => {
            const { repository, inviteLocalDataSource } = createRepository({ cid: 'cloud-a', uid: 'me' });

            await repository.cacheClear();

            expect(inviteLocalDataSource.cacheClear).not.toHaveBeenCalled();
        });
    });
});
