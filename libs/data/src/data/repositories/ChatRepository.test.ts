import type { ChatFeedResult } from '@lemoncloud/chatic-socials-api';
import { ChatRepository } from './ChatRepository';

describe('ChatRepository cache policy', () => {
    const payload = { channelId: 'ch-1', limit: 30 } as any;
    const remoteResult = {
        list: [{ id: 'r1', channelId: 'ch-1', chatNo: 10, content: 'remote' }],
        cursorNo: 0,
        limit: 30,
        readNo: 0,
        total: 1,
    } as ChatFeedResult;

    const createRepository = ({
        localResult,
        hasGap = false,
    }: {
        localResult: ChatFeedResult | null;
        hasGap?: boolean;
    }) => {
        const remote = {
            sendChat: jest.fn(),
            fetchChat: jest.fn(),
        };

        const local = {
            fetchChat: jest.fn(async () => localResult),
            getChatsByChannel: jest.fn(),
            upsertChat: jest.fn(),
            upsertChats: jest.fn(),
            deleteChat: jest.fn(),
            deleteChats: jest.fn(),
            updateChatPartial: jest.fn(),
            clearAll: jest.fn(),
            checkContinuity: jest.fn(async () => ({ hasGap, missingRanges: [] })),
        };

        const requestManager = {
            request: jest.fn(async (sendAction: (ref: string) => void) => {
                sendAction('ref-1');
                return remoteResult;
            }),
        };

        const contextProvider = {
            getContext: () => ({ cid: 'cloud-a', uid: 'user-a' }),
            setContext: () => undefined,
        };

        const domainEventBus = {
            on: jest.fn(() => () => undefined),
            emit: jest.fn(),
            onAny: jest.fn(() => () => undefined),
        };

        const repository = new ChatRepository(
            remote as any,
            local as any,
            requestManager as any,
            contextProvider,
            domainEventBus as any
        );

        return { repository, remote, local, requestManager };
    };

    it('returns local first and schedules remote refresh for cache-first', async () => {
        const localResult = {
            list: [{ id: 'l1', channelId: 'ch-1', chatNo: 5, content: 'local' }],
            cursorNo: 0,
            limit: 30,
            readNo: 0,
            total: 1,
        } as ChatFeedResult;
        const { repository, remote, requestManager } = createRepository({ localResult, hasGap: false });

        const result = await repository.fetchChat(payload, { cachePolicy: 'cache-first' });

        expect(result).toEqual(localResult);
        await Promise.resolve();
        expect(remote.fetchChat).toHaveBeenCalledTimes(1);
        expect(requestManager.request).toHaveBeenCalledTimes(1);
    });

    it('skips local when continuity has gap and fetches remote', async () => {
        const localResult = {
            list: [{ id: 'l1', channelId: 'ch-1', chatNo: 5, content: 'local' }],
            cursorNo: 0,
            limit: 30,
            readNo: 0,
            total: 1,
        } as ChatFeedResult;
        const { repository, remote, local } = createRepository({ localResult, hasGap: true });

        const result = await repository.fetchChat(payload, { cachePolicy: 'cache-first' });

        expect(local.checkContinuity).toHaveBeenCalledWith('ch-1', { cid: 'cloud-a', uid: 'user-a' });
        expect(remote.fetchChat).toHaveBeenCalledTimes(1);
        expect(result).toMatchObject({
            ...remoteResult,
            list: [
                expect.objectContaining({
                    id: 'r1',
                    channelId: 'ch-1',
                    chatNo: 10,
                    cid: 'cloud-a',
                    isPending: false,
                    isFailed: false,
                }),
            ],
        });
    });

    it('returns fallback for cache-only when local is empty', async () => {
        const { repository, remote } = createRepository({ localResult: null });

        const result = await repository.fetchChat(payload, { cachePolicy: 'cache-only' });

        expect(remote.fetchChat).not.toHaveBeenCalled();
        expect(result).toEqual({
            list: [],
            cursorNo: 0,
            limit: 30,
            readNo: 0,
            total: 0,
        });
    });
});
