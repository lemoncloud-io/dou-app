import type { DataRepositoriesV2, DomainListResult } from '@chatic/data';
import { logger } from '@chatic/bridges';
import { ChannelChatSyncController } from './ChannelChatSyncController';

jest.mock('@chatic/bridges', () => ({
    logger: {
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
    },
}));

const flushAsyncWork = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};

const waitForIdle = async (controller: ChannelChatSyncController) => {
    for (let index = 0; index < 20; index += 1) {
        await flushAsyncWork();
        if (!controller.getDebugState().inFlight) {
            return;
        }
    }
};

const createRepositories = () => {
    const chatCacheReadList = jest.fn(async ({ channelId }: { channelId: string }) => {
        if (channelId === 'ch-1') {
            return { list: [{ id: 'chat-1', channelId, chatNo: 2 }], meta: { total: 1 } } as DomainListResult<any>;
        }

        return { list: [{ id: 'chat-2', channelId, chatNo: 1 }], meta: { total: 1 } } as DomainListResult<any>;
    });

    const repositories = {
        channel: {
            refreshListSince: jest.fn().mockResolvedValue({ syncedAt: 33, wroteCount: 2, removedCount: 0 }),
            cacheReadList: jest.fn().mockResolvedValue({
                list: [
                    { id: 'ch-1', chatNo: 3 },
                    { id: 'ch-2', chatNo: 1 },
                ],
                meta: { total: 2 },
            }),
        },
        chat: {
            cacheReadList: chatCacheReadList,
            refreshList: jest.fn().mockResolvedValue({ wroteCount: 1, total: 1 }),
        },
        join: {},
        inviteCloud: {},
        profile: {},
        site: {},
        user: {},
    } as unknown as DataRepositoriesV2;

    return { repositories, chatCacheReadList };
};

const createSocketManager = (isConnected = false) => {
    let snapshot = {
        state: isConnected ? 'connected' : 'idle',
        isConnected,
        isVerified: false,
        isDeviceRegistered: false,
        connectionId: null,
    } as const;

    const listeners = new Set<(state: typeof snapshot) => void>();

    return {
        manager: {
            getSnapshot: jest.fn(() => snapshot),
            subscribe: jest.fn((listener: (state: typeof snapshot) => void) => {
                listeners.add(listener);
                listener(snapshot);
                return () => {
                    listeners.delete(listener);
                };
            }),
        },
        emit(nextConnected: boolean) {
            snapshot = {
                ...snapshot,
                state: nextConnected ? 'connected' : 'closed',
                isConnected: nextConnected,
            };

            for (const listener of listeners) {
                listener(snapshot);
            }
        },
    };
};

describe('ChannelChatSyncController', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    it('does not run sync before the socket is connected', async () => {
        const socket = createSocketManager(false);
        const { repositories } = createRepositories();
        const controller = new ChannelChatSyncController({
            socketManager: socket.manager as any,
            getRepositories: () => repositories,
        });

        controller.ensure({
            context: { cid: 'cloud-1', sid: 'site-1', uid: 'user-1' },
            socket: { config: { url: 'wss://socket', deviceId: 'device-1' } },
        });

        await controller.start();
        await waitForIdle(controller);

        expect(repositories.channel.refreshListSince).not.toHaveBeenCalled();
    });

    it('runs a full sync once on bootstrap when already connected', async () => {
        const socket = createSocketManager(true);
        const { repositories } = createRepositories();
        const controller = new ChannelChatSyncController({
            socketManager: socket.manager as any,
            getRepositories: () => repositories,
        });

        controller.ensure({
            context: { cid: 'cloud-1', sid: 'site-1', uid: 'user-1' },
            socket: { config: { url: 'wss://socket', deviceId: 'device-1' } },
        });

        await controller.start();
        await waitForIdle(controller);

        expect(repositories.channel.refreshListSince).toHaveBeenCalledTimes(1);
        expect(repositories.channel.refreshListSince).toHaveBeenCalledWith(0);
        expect(repositories.chat.refreshList).toHaveBeenCalledTimes(1);
        expect(repositories.chat.refreshList).toHaveBeenCalledWith({ channelId: 'ch-1', limit: 50 });
        expect((logger.error as jest.Mock).mock.calls).toEqual([]);
    });

    it('runs a full sync again after a reconnect edge', async () => {
        const socket = createSocketManager(false);
        const { repositories } = createRepositories();
        let resolveFirstRun: (() => void) | null = null;

        (repositories.channel.refreshListSince as jest.Mock)
            .mockImplementationOnce(
                () =>
                    new Promise(resolve => {
                        resolveFirstRun = () => resolve({ syncedAt: 33, wroteCount: 2, removedCount: 0 });
                    })
            )
            .mockResolvedValue({ syncedAt: 44, wroteCount: 2, removedCount: 0 });

        const controller = new ChannelChatSyncController({
            socketManager: socket.manager as any,
            getRepositories: () => repositories,
        });

        controller.ensure({
            context: { cid: 'cloud-1', sid: 'site-1', uid: 'user-1' },
            socket: { config: { url: 'wss://socket', deviceId: 'device-1' } },
        });

        await controller.start();
        socket.emit(true);
        await flushAsyncWork();
        resolveFirstRun?.();
        await waitForIdle(controller);
        socket.emit(false);
        socket.emit(true);
        await waitForIdle(controller);

        expect(repositories.channel.refreshListSince).toHaveBeenNthCalledWith(1, 0);
        expect(repositories.channel.refreshListSince).toHaveBeenNthCalledWith(2, 0);
    });

    it('stores the syncedAt checkpoint after a successful manual run', async () => {
        const socket = createSocketManager(true);
        const { repositories } = createRepositories();
        const controller = new ChannelChatSyncController({
            socketManager: socket.manager as any,
            getRepositories: () => repositories,
        });

        controller.ensure({
            context: { cid: 'cloud-1', sid: 'site-1', uid: 'user-1' },
            socket: { config: { url: 'wss://socket', deviceId: 'device-1' } },
        });
        await controller.start();
        await waitForIdle(controller);

        await controller.requestRun('manual');

        expect((logger.error as jest.Mock).mock.calls).toEqual([]);
        expect(controller.getDebugState().lastSyncedAt).toBe(33);
    });

    it('skips interval runs while a sync is already in flight', async () => {
        const socket = createSocketManager(true);
        const { repositories } = createRepositories();
        let resolveSync: (() => void) | null = null;

        (repositories.channel.refreshListSince as jest.Mock).mockImplementation(
            () =>
                new Promise(resolve => {
                    resolveSync = () => resolve({ syncedAt: 33, wroteCount: 2, removedCount: 0 });
                })
        );

        const controller = new ChannelChatSyncController({
            socketManager: socket.manager as any,
            getRepositories: () => repositories,
            intervalMs: 1000,
        });

        controller.ensure({
            context: { cid: 'cloud-1', sid: 'site-1', uid: 'user-1' },
            socket: { config: { url: 'wss://socket', deviceId: 'device-1' } },
        });

        await controller.start();
        await flushAsyncWork();

        jest.advanceTimersByTime(3000);
        expect(repositories.channel.refreshListSince).toHaveBeenCalledTimes(1);

        resolveSync?.();
        await Promise.resolve();
    });

    it('refreshes chats only when the server chatNo is ahead of local cache', async () => {
        const socket = createSocketManager(true);
        const { repositories } = createRepositories();
        const controller = new ChannelChatSyncController({
            socketManager: socket.manager as any,
            getRepositories: () => repositories,
        });

        controller.ensure({
            context: { cid: 'cloud-1', sid: 'site-1', uid: 'user-1' },
            socket: { config: { url: 'wss://socket', deviceId: 'device-1' } },
        });

        await controller.start();
        await waitForIdle(controller);

        expect(repositories.chat.refreshList).toHaveBeenCalledTimes(1);
        expect(repositories.chat.refreshList).toHaveBeenCalledWith({ channelId: 'ch-1', limit: 50 });
    });

    it('does not update since when channel sync fails', async () => {
        const socket = createSocketManager(true);
        const { repositories } = createRepositories();
        (repositories.channel.refreshListSince as jest.Mock).mockRejectedValue(new Error('boom'));

        const controller = new ChannelChatSyncController({
            socketManager: socket.manager as any,
            getRepositories: () => repositories,
        });

        controller.ensure({
            context: { cid: 'cloud-1', sid: 'site-1', uid: 'user-1' },
            socket: { config: { url: 'wss://socket', deviceId: 'device-1' } },
        });

        await controller.start();
        await waitForIdle(controller);

        expect(controller.getDebugState().lastSyncedAt).toBe(0);
    });

    it('resets scope checkpoint when the binding scope changes', async () => {
        const socket = createSocketManager(true);
        const { repositories } = createRepositories();
        const controller = new ChannelChatSyncController({
            socketManager: socket.manager as any,
            getRepositories: () => repositories,
        });

        controller.ensure({
            context: { cid: 'cloud-1', sid: 'site-1', uid: 'user-1' },
            socket: { config: { url: 'wss://socket', deviceId: 'device-1' } },
        });
        await controller.start();
        await waitForIdle(controller);
        controller.stop();

        (repositories.channel.refreshListSince as jest.Mock).mockClear();
        controller.ensure({
            context: { cid: 'cloud-1', sid: 'site-2', uid: 'user-1' },
            socket: { config: { url: 'wss://socket', deviceId: 'device-1' } },
        });
        await controller.start();
        await waitForIdle(controller);

        expect(repositories.channel.refreshListSince).toHaveBeenCalledWith(0);
    });
});
