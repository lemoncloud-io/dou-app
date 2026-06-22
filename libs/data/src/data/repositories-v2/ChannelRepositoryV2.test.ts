import { ChannelRepositoryV2 } from './ChannelRepositoryV2';

const createEventBus = () => {
    const listeners = new Map<string, Set<(payload: any) => void>>();
    return {
        on(event: string, callback: (payload: any) => void) {
            const group = listeners.get(event) ?? new Set<(payload: any) => void>();
            group.add(callback);
            listeners.set(event, group);
            return () => {
                group.delete(callback);
                if (group.size === 0) listeners.delete(event);
            };
        },
        emit(event: string, payload: any) {
            for (const callback of listeners.get(event) ?? []) {
                callback(payload);
            }
        },
        onAny: jest.fn(() => () => undefined),
    };
};

const createDeferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>(res => {
        resolve = res;
    });
    return { promise, resolve };
};

const flushAsync = async () => {
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
};

describe('ChannelRepositoryV2', () => {
    const createRepository = () => {
        // Mock remote and local collaborators independently so orchestration behavior is easy to assert.
        const channelRemoteDataSource = {
            fetchChannel: jest.fn(),
            syncChannel: jest.fn(),
            createChannel: jest.fn(),
            updateChannel: jest.fn(),
            inviteChannel: jest.fn(),
            leaveChannel: jest.fn(),
            deleteChannel: jest.fn(),
            getSelfChannel: jest.fn(),
            getUnreads: jest.fn(),
        };
        const channelLocalDataSource = {
            observeList: jest.fn(() => () => undefined),
            observeItem: jest.fn(() => () => undefined),
            cacheRead: jest.fn(),
            cacheReadList: jest.fn(),
            cacheWrite: jest.fn(),
            cacheWriteMany: jest.fn(),
            cacheDelete: jest.fn(),
            cacheDeleteMany: jest.fn(),
            cacheClear: jest.fn(),
        };
        const contextProvider = {
            getContext: () => ({ cid: 'cloud-a', sid: 'site-1', uid: 'me' }),
            setContext: () => undefined,
        };
        const domainEventBus = {
            on: jest.fn(() => () => undefined),
            emit: jest.fn(),
            onAny: jest.fn(() => () => undefined),
        };

        return {
            repository: new ChannelRepositoryV2(
                channelRemoteDataSource as any,
                channelLocalDataSource as any,
                contextProvider,
                domainEventBus as any
            ),
            channelRemoteDataSource,
            channelLocalDataSource,
        };
    };

    it('removes stale local channels that the remote refresh no longer returns', async () => {
        const { repository, channelRemoteDataSource, channelLocalDataSource } = createRepository();
        channelRemoteDataSource.fetchChannel.mockResolvedValue({
            list: [{ id: 'ch-1', sid: 'site-1', updatedAt: 100 }],
        });
        channelLocalDataSource.cacheReadList.mockResolvedValue({
            list: [{ id: 'ch-1' }, { id: 'stale' }],
        });

        const result = await repository.refreshList({ sid: 'site-1' } as any);

        // The repository should reconcile the local list against the latest server snapshot.
        expect(channelLocalDataSource.cacheDeleteMany).toHaveBeenCalledWith(['stale'], {
            cid: 'cloud-a',
            sid: 'site-1',
            uid: 'me',
        });
        expect(result).toEqual({ wroteCount: 1 });
    });

    it('delegates read and cache helper methods to the local datasource with the runtime context', async () => {
        const { repository, channelLocalDataSource } = createRepository();

        await repository.cacheRead('ch-1');
        await repository.cacheReadList({ sid: 'site-1' } as any);
        await repository.cacheWrite({ id: 'ch-1' } as any);
        await repository.cacheWriteMany([{ id: 'ch-1' }] as any);
        await repository.cacheDelete('ch-1');
        await repository.cacheClear();

        // Helper methods should stay thin wrappers so hooks can rely on a consistent context-bound API.
        expect(channelLocalDataSource.cacheRead).toHaveBeenCalledWith('ch-1', {
            cid: 'cloud-a',
            sid: 'site-1',
            uid: 'me',
        });
        expect(channelLocalDataSource.cacheClear).toHaveBeenCalledWith({
            cid: 'cloud-a',
            sid: 'site-1',
            uid: 'me',
        });
    });

    it('passes through remote helper commands that do not mutate local cache themselves', async () => {
        const { repository, channelRemoteDataSource } = createRepository();
        channelRemoteDataSource.getSelfChannel.mockResolvedValue({ id: 'self-channel' });
        channelRemoteDataSource.getUnreads.mockResolvedValue({ total: 3 });

        // These helpers are transport pass-throughs and should not invent local side effects.
        await expect(repository.getSelfChannel({} as any)).resolves.toEqual({ id: 'self-channel' });
        await expect(repository.getUnreads({} as any)).resolves.toEqual({ total: 3 });
    });

    it('serializes channel aggregate updates from chat and join events for the same channel', async () => {
        const deferred = createDeferred();
        const channelRemoteDataSource = {
            fetchChannel: jest.fn(),
            syncChannel: jest.fn(),
            createChannel: jest.fn(),
            updateChannel: jest.fn(),
            inviteChannel: jest.fn(),
            leaveChannel: jest.fn(),
            deleteChannel: jest.fn(),
            getSelfChannel: jest.fn(),
            getUnreads: jest.fn(),
        };
        const channelLocalDataSource = {
            observeList: jest.fn(() => () => undefined),
            observeItem: jest.fn(() => () => undefined),
            cacheRead: jest
                .fn()
                .mockImplementationOnce(() => deferred.promise.then(() => ({ id: 'ch-1', unreadCount: 0, chatNo: 0 })))
                .mockResolvedValue({ id: 'ch-1', unreadCount: 1, chatNo: 10, lastChat$: { chatNo: 10 } }),
            cacheReadList: jest.fn(),
            cacheWrite: jest.fn().mockResolvedValue(undefined),
            cacheWriteMany: jest.fn(),
            cacheDelete: jest.fn(),
            cacheDeleteMany: jest.fn(),
            cacheClear: jest.fn(),
        };
        const eventBus = createEventBus();
        new ChannelRepositoryV2(
            channelRemoteDataSource as any,
            channelLocalDataSource as any,
            {
                getContext: () => ({ cid: 'cloud-a', sid: 'site-1', uid: 'me' }),
                setContext: () => undefined,
            },
            eventBus as any
        );

        eventBus.emit('chat:create', { data: { id: 'm1', channelId: 'ch-1', ownerId: 'other', chatNo: 10 } });
        eventBus.emit('join:update', { data: { id: 'j1', channelId: 'ch-1', userId: 'me', chatNo: 10 } });
        await flushAsync();

        expect(channelLocalDataSource.cacheRead).toHaveBeenCalledTimes(1);

        deferred.resolve();
        await flushAsync();
        await flushAsync();

        expect(channelLocalDataSource.cacheRead).toHaveBeenCalledTimes(2);
        expect(channelLocalDataSource.cacheWrite).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ id: 'ch-1', unreadCount: 1 }),
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
        expect(channelLocalDataSource.cacheWrite).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ id: 'ch-1', unreadCount: 0 }),
            { cid: 'cloud-a', sid: 'site-1', uid: 'me' }
        );
    });
});
