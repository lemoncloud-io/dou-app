import { ChatRepository } from './ChatRepository';

describe('ChatRepository cache policy', () => {
    const payload = { channelId: 'ch-1', limit: 30 } as any;

    const remoteResult = {
        list: [{ id: 'r1', channelId: 'ch-1', chatNo: 10, content: 'remote' }],
        cursorNo: 0,
        readNo: 0,
        limit: 30,
        total: 1,
    };

    const createRepository = ({ localResult }: { localResult: any | null }) => {
        const remote = {
            sendChat: jest.fn(),
            fetchChat: jest.fn().mockResolvedValue(remoteResult),
        };

        const local = {
            fetchList: jest.fn(async () => localResult),
            getById: jest.fn(),
            upsert: jest.fn(),
            upsertMany: jest.fn(),
            remove: jest.fn(),
            removeMany: jest.fn(),
            clearAll: jest.fn(),
            subscribeList: jest.fn(() => () => undefined),
            subscribeItem: jest.fn(() => () => undefined),
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

        const repository = new ChatRepository(remote as any, local as any, contextProvider, domainEventBus as any);

        return { repository, remote, local };
    };

    it('returns local first and schedules remote refresh in background for cache-first', async () => {
        // 로컬 캐시에 유효한 데이터가 있는 상황
        const localResult = {
            list: [{ id: 'l1', channelId: 'ch-1', chatNo: 5, content: 'local' }],
            meta: { cursorNo: 0, limit: 30, readNo: 0, total: 1, source: 'local' },
        };
        const { repository, remote, local } = createRepository({ localResult });

        const result = await repository.fetchChat(payload, { cachePolicy: 'cache-first' });

        // 1. 로컬 데이터를 즉시 반환해야 함
        expect(result).toEqual(localResult);
        expect(local.fetchList).toHaveBeenCalledTimes(1);

        // 2. 백그라운드 동기화(runInBackground)가 실행되었는지 이벤트 루프 대기 후 확인
        await Promise.resolve();
        expect(remote.fetchChat).toHaveBeenCalledTimes(1);
    });

    it('awaits and returns remote data when local cache is empty', async () => {
        // 로컬에 데이터가 없는 상황 (list가 빈 배열)
        const localResult = {
            list: [],
            meta: { cursorNo: 0, limit: 30, readNo: 0, total: 0, source: 'local' },
        };
        const { repository, remote, local } = createRepository({ localResult });

        const result = await repository.fetchChat(payload, { cachePolicy: 'cache-first' });

        // 1. 로컬 조회를 시도했으나 데이터가 없으므로 원격 데이터를 반환해야 함
        expect(local.fetchList).toHaveBeenCalledTimes(1);
        expect(result.list[0]).toMatchObject({ id: 'r1', content: 'remote' });
        expect(result.meta.source).toBe('remote');

        // 2. 원격 조회가 백그라운드가 아닌 메인 흐름에서 await되어 실행되었는지 확인
        expect(remote.fetchChat).toHaveBeenCalledTimes(1);
    });

    it('ignores local cache and directly fetches remote for network-only policy', async () => {
        // 로컬에 유효한 데이터가 있더라도 무시해야 함
        const localResult = {
            list: [{ id: 'l1', content: 'local' }],
            meta: { source: 'local' },
        };
        const { repository, remote, local } = createRepository({ localResult });

        const result = await repository.fetchChat(payload, { cachePolicy: 'network-only' });

        // 1. 로컬 캐시 조회(fetchList) 자체를 호출하지 않아야 함
        expect(local.fetchList).not.toHaveBeenCalled();

        // 2. 즉시 원격 데이터가 반환되어야 함
        expect(result.list[0]).toMatchObject({ id: 'r1', content: 'remote' });
        expect(result.meta.source).toBe('remote');
        expect(remote.fetchChat).toHaveBeenCalledTimes(1);
    });
});
