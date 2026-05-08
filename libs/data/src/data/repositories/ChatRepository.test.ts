import { ChatRepository } from './ChatRepository';

describe('ChatRepository cache policy', () => {
    const payload = { channelId: 'ch-1', limit: 30 } as any;

    // 💡 수정: ChatFeedResult 대신 DomainListResult 메타데이터 분리 형태
    const remoteResult = {
        list: [{ id: 'r1', channelId: 'ch-1', chatNo: 10, content: 'remote' }],
        cursorNo: 0,
        readNo: 0,
        limit: 30,
        total: 1,
    };

    const createRepository = ({ localResult, hasGap = false }: { localResult: any | null; hasGap?: boolean }) => {
        const remote = {
            sendChat: jest.fn(),
            fetchChat: jest.fn(),
        };

        const local = {
            fetchList: jest.fn(async () => localResult),
            getById: jest.fn(),
            upsert: jest.fn(),
            upsertMany: jest.fn(),
            remove: jest.fn(),
            removeMany: jest.fn(),
            clearAll: jest.fn(),
            checkContinuity: jest.fn(async () => ({ hasGap, missingRanges: [] })),
            subscribeList: jest.fn(() => () => undefined),
            subscribeItem: jest.fn(() => () => undefined),
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
            meta: { cursorNo: 0, limit: 30, readNo: 0, total: 1, source: 'local' },
        };
        const { repository, remote, requestManager } = createRepository({ localResult, hasGap: false });

        const result = await repository.fetchChat(payload, { cachePolicy: 'cache-first' });

        // 내부에서 cursorNo 등을 meta 객체로 생성하므로 일치하는지 확인
        expect(result.list).toEqual(localResult.list);
        expect(result.meta.total).toEqual(1);
        await Promise.resolve();
        expect(remote.fetchChat).toHaveBeenCalledTimes(1);
        expect(requestManager.request).toHaveBeenCalledTimes(1);
    });

    it('skips local when continuity has gap and fetches remote', async () => {
        const localResult = {
            list: [{ id: 'l1', channelId: 'ch-1', chatNo: 5, content: 'local' }],
            meta: { cursorNo: 0, limit: 30, readNo: 0, total: 1, source: 'local' },
        };
        const { repository, remote, local } = createRepository({ localResult, hasGap: true });

        const result = await repository.fetchChat(payload, { cachePolicy: 'cache-first' });

        expect(local.checkContinuity).toHaveBeenCalledWith('ch-1', { cid: 'cloud-a', uid: 'user-a' });
        expect(remote.fetchChat).toHaveBeenCalledTimes(1);
        expect(result.list[0]).toMatchObject({ id: 'r1', chatNo: 10 });
        expect(result.meta.source).toBe('remote');
    });

    it('returns fallback for cache-only when local is empty', async () => {
        const { repository, remote } = createRepository({ localResult: null });

        const result = await repository.fetchChat(payload, { cachePolicy: 'cache-only' });

        expect(remote.fetchChat).not.toHaveBeenCalled();
        expect(result).toEqual({
            list: [],
            meta: { cursorNo: 0, limit: 30, readNo: 0, total: 0, source: 'fallback' },
        });
    });

    it('treats cursorNo=0 empty local result as valid cache', async () => {
        const localResult = {
            list: [],
            meta: { cursorNo: 0, limit: 30, readNo: 0, total: 0, source: 'local' },
        };
        const { repository, remote } = createRepository({ localResult, hasGap: false });

        const result = await repository.fetchChat({ channelId: 'ch-1', limit: 30, cursorNo: 0 } as any, {
            cachePolicy: 'cache-first',
        });

        // 빈 리스트라도 cursorNo가 0이면 로컬 유효로 판정됨
        expect(result.list).toEqual([]);
        await Promise.resolve();
        expect(remote.fetchChat).toHaveBeenCalledTimes(1);
    });
});
