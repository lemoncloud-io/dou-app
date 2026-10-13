import { JoinRepository } from './JoinRepository';

describe('JoinRepository', () => {
    const createRepository = () => {
        // The socket, the cache and the outbox are each a seam, so which half of a write went where is
        // explicit.
        const joinSocketDataSource = {
            readChat: jest.fn(),
            updateJoin: jest.fn(),
            updateChannelJoin: jest.fn(),
        };
        const joinLocalDataSource = {
            observeList: jest.fn(() => () => undefined),
            observeItem: jest.fn(() => () => undefined),
            cacheRead: jest.fn(),
            cacheReadList: jest.fn().mockResolvedValue({ list: [] }),
            cacheWrite: jest.fn(),
            cacheWriteMany: jest.fn(),
            cacheDelete: jest.fn(),
            cacheClear: jest.fn(),
        };
        const receipt = { delivered: Promise.resolve() };
        const outbox = { set: jest.fn(() => receipt) };
        const contextProvider = {
            getContext: () => ({ cid: 'cloud-a', sid: 'site-1', uid: 'me' }),
            setContext: () => undefined,
        };

        return {
            repository: new JoinRepository(
                joinSocketDataSource as any,
                joinLocalDataSource as any,
                contextProvider,
                outbox as any
            ),
            joinSocketDataSource,
            joinLocalDataSource,
            outbox,
            receipt,
        };
    };

    const CONTEXT = { cid: 'cloud-a', sid: 'site-1', uid: 'me' };
    const MY_JOIN = { id: 'ch-1@me', channelId: 'ch-1', userId: 'me', readNo: 4, notify: 'all', nick: 'Old' };

    describe('readChat', () => {
        it('moves my cursor locally, then hands the read to the outbox — never the socket', async () => {
            const { repository, joinSocketDataSource, joinLocalDataSource, outbox, receipt } = createRepository();
            joinLocalDataSource.cacheReadList.mockResolvedValue({ list: [MY_JOIN] });

            const result = await repository.readChat({ channelId: 'ch-1', chatNo: 9 } as any);

            expect(joinLocalDataSource.cacheWrite).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'ch-1@me', readNo: 9, chatNo: 9 }),
                CONTEXT
            );
            expect(outbox.set).toHaveBeenCalledWith({
                op: 'join.read',
                cid: 'cloud-a',
                uid: 'me',
                key: 'ch-1',
                value: 9,
            });
            expect(joinSocketDataSource.readChat).not.toHaveBeenCalled();
            expect(result).toBe(receipt);
        });

        it('writes the local cursor before the outbox sees the read', async () => {
            const { repository, joinLocalDataSource, outbox } = createRepository();
            const order: string[] = [];
            joinLocalDataSource.cacheWrite.mockImplementation(async () => void order.push('local'));
            outbox.set.mockImplementation(() => {
                order.push('outbox');
                return { delivered: Promise.resolve() };
            });

            await repository.readChat({ channelId: 'ch-1', chatNo: 9 } as any);

            expect(order).toEqual(['local', 'outbox']);
        });

        it('throws without channelId or chatNo instead of queuing a read it cannot send', async () => {
            const { repository, outbox } = createRepository();

            await expect(repository.readChat({ chatNo: 9 } as any)).rejects.toThrow(
                '[Repository] channelId is required.'
            );
            await expect(repository.readChat({ channelId: 'ch-1' } as any)).rejects.toThrow('chatNo is required');
            expect(outbox.set).not.toHaveBeenCalled();
        });
    });

    describe('updateJoin', () => {
        it('writes my fields locally and hands each to the outbox under its own op, with the value it replaced', async () => {
            const { repository, joinSocketDataSource, joinLocalDataSource, outbox } = createRepository();
            joinLocalDataSource.cacheReadList.mockResolvedValue({ list: [MY_JOIN] });

            await repository.updateJoin({ channelId: 'ch-1', notify: 'none', nick: 'New' } as any);

            expect(joinLocalDataSource.cacheWrite).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'ch-1@me', notify: 'none', nick: 'New' }),
                CONTEXT
            );
            const scope = { cid: 'cloud-a', uid: 'me', key: 'ch-1' };
            expect(outbox.set).toHaveBeenCalledWith({ op: 'join.notify', ...scope, value: 'none', previous: 'all' });
            expect(outbox.set).toHaveBeenCalledWith({ op: 'join.nick', ...scope, value: 'New', previous: 'Old' });
            expect(joinSocketDataSource.updateJoin).not.toHaveBeenCalled();
        });

        it('settles its receipt only when every field it queued has landed', async () => {
            const { repository, joinLocalDataSource, outbox } = createRepository();
            joinLocalDataSource.cacheReadList.mockResolvedValue({ list: [MY_JOIN] });
            outbox.set
                .mockReturnValueOnce({ delivered: Promise.resolve() })
                .mockImplementationOnce(() => ({ delivered: Promise.reject(new Error('403 FORBIDDEN')) }));

            const { delivered } = await repository.updateJoin({
                channelId: 'ch-1',
                notify: 'none',
                nick: 'New',
            } as any);

            await expect(delivered).rejects.toThrow('403');
        });

        it('refuses to write anyone else’s join — the outbox keys writes by my uid', async () => {
            const { repository, joinLocalDataSource, outbox } = createRepository();
            joinLocalDataSource.cacheReadList.mockResolvedValue({ list: [MY_JOIN] });

            await expect(
                repository.updateJoin({ channelId: 'ch-1', userId: 'u9', notify: 'none' } as any)
            ).rejects.toThrow('only my own join');
            expect(outbox.set).not.toHaveBeenCalled();
        });

        it('throws when my join row is not cached, as before', async () => {
            const { repository, outbox } = createRepository();

            await expect(repository.updateJoin({ channelId: 'ch-1', notify: 'none' } as any)).rejects.toThrow(
                '[Repository] id is required.'
            );
            expect(outbox.set).not.toHaveBeenCalled();
        });
    });

    describe('outbox hooks', () => {
        it('sendRead is the socket half only', async () => {
            const { repository, joinSocketDataSource, joinLocalDataSource } = createRepository();
            joinSocketDataSource.readChat.mockResolvedValue({ id: 'ch-1@me', chatNo: 9 });

            const answer = await repository.sendRead({ channelId: 'ch-1', chatNo: 9 });

            expect(joinSocketDataSource.readChat).toHaveBeenCalledWith(
                { channelId: 'ch-1', chatNo: 9 },
                { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
            );
            expect(joinLocalDataSource.cacheWrite).not.toHaveBeenCalled();
            expect(answer).toEqual({ id: 'ch-1@me', chatNo: 9 });
        });

        it('sendJoinUpdate names my join row by its id when the write goes out', async () => {
            const { repository, joinSocketDataSource, joinLocalDataSource } = createRepository();
            joinLocalDataSource.cacheReadList.mockResolvedValue({ list: [MY_JOIN] });

            await repository.sendJoinUpdate('ch-1', { notify: 'none' });

            expect(joinSocketDataSource.updateJoin).toHaveBeenCalledWith(
                { id: 'ch-1@me', notify: 'none' },
                { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
            );
        });

        it('writeMyJoinLocally puts a field back without the socket', async () => {
            const { repository, joinSocketDataSource, joinLocalDataSource } = createRepository();
            joinLocalDataSource.cacheReadList.mockResolvedValue({ list: [MY_JOIN] });

            await repository.writeMyJoinLocally('ch-1', { notify: 'all' });

            expect(joinLocalDataSource.cacheWrite).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'ch-1@me', notify: 'all' }),
                CONTEXT
            );
            expect(joinSocketDataSource.updateJoin).not.toHaveBeenCalled();
        });
    });
});
