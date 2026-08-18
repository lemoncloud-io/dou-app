import { NativeDBAdapter, resetNativeBatchReadSupport, resetNativeLastChatsSupport } from './NativeDBAdapter';
import type { IWebBridgeClient } from '@chatic/bridges';
import type { DataContextProvider } from '../../repositories-v2/types';

// 캐시 메타 주입 유틸리티 모킹 (페이로드 검증을 단순화하기 위함)
jest.mock('./utils', () => {
    const actualUtils = jest.requireActual('./utils');
    return {
        ...actualUtils,
        withCacheMeta: jest.fn((type: string, item: any) => ({ ...item, __cacheMeta: { mocked: true } })),
    };
});

describe('NativeDBAdapter', () => {
    let mockBridge: jest.Mocked<IWebBridgeClient>;
    let mockContextProvider: jest.Mocked<DataContextProvider>;
    let adapter: NativeDBAdapter<'chat'>;

    const mockScope = { cid: 'test-cid', uid: 'test-uid' };

    beforeEach(() => {
        // Bridge와 ContextProvider를 깔끔하게 모킹
        mockBridge = {
            request: jest.fn(),
        } as unknown as jest.Mocked<IWebBridgeClient>;

        mockContextProvider = {
            getContext: jest.fn().mockReturnValue(mockScope),
        } as unknown as jest.Mocked<DataContextProvider>;

        // 구현체 인스턴스 직접 생성 (팩토리 함수 의존 탈피)
        adapter = new NativeDBAdapter<'chat'>(mockBridge, 'chat', mockContextProvider);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('save', () => {
        it('context의 cid와 uid를 포함하여 브릿지에 SaveCacheData를 요청한다', async () => {
            const item = { id: 'chat-1', text: 'hello' } as any;
            await adapter.save('chat-1', item);

            expect(mockBridge.request).toHaveBeenCalledWith({
                type: 'SaveCacheData',
                data: {
                    type: 'chat',
                    cid: mockScope.cid,
                    uid: mockScope.uid,
                    id: 'chat-1',
                    item: { ...item, __cacheMeta: { mocked: true } },
                },
            });
        });
    });

    describe('saveAll', () => {
        it('빈 배열이 주어지면 브릿지를 호출하지 않고 빈 배열을 반환한다', async () => {
            const result = await adapter.saveAll([]);
            expect(mockBridge.request).not.toHaveBeenCalled();
            expect(result).toEqual([]);
        });

        it('항목 배열이 주어지면 SaveAllCacheData를 요청한다', async () => {
            const items = [{ id: 'chat-1' }, { id: 'chat-2' }] as any[];
            await adapter.saveAll(items);

            expect(mockBridge.request).toHaveBeenCalledWith({
                type: 'SaveAllCacheData',
                data: {
                    type: 'chat',
                    cid: mockScope.cid,
                    uid: mockScope.uid,
                    items: items.map(item => ({ ...item, __cacheMeta: { mocked: true } })),
                },
            });
        });
    });

    describe('load', () => {
        it('브릿지에 FetchCacheData를 요청하고 응답에서 item을 반환한다', async () => {
            const expectedItem = { id: 'chat-1', text: 'loaded' };
            mockBridge.request.mockResolvedValueOnce({
                data: { item: expectedItem },
            } as any);

            const result = await adapter.load('chat-1');

            expect(mockBridge.request).toHaveBeenCalledWith({
                type: 'FetchCacheData',
                data: { type: 'chat', cid: mockScope.cid, uid: mockScope.uid, id: 'chat-1' },
            });
            expect(result).toEqual(expectedItem);
        });

        it('응답에 item이 없으면 null을 반환한다', async () => {
            mockBridge.request.mockResolvedValueOnce({ data: {} } as any);
            const result = await adapter.load('missing-id');
            expect(result).toBeNull();
        });
    });

    describe('loadAll', () => {
        it('옵션을 병합하여 FetchAllCacheData를 요청하고 items를 반환한다', async () => {
            const expectedItems = [{ id: 'chat-1' }, { id: 'chat-2' }];
            mockBridge.request.mockResolvedValueOnce({
                data: { items: expectedItems },
            } as any);

            const options = { keyword: 'test', limit: 10 };
            const result = await adapter.loadAll(options as any);

            expect(mockBridge.request).toHaveBeenCalledWith({
                type: 'FetchAllCacheData',
                data: {
                    type: 'chat',
                    cid: mockScope.cid,
                    uid: mockScope.uid,
                    query: { cid: mockScope.cid, uid: mockScope.uid, ...options },
                },
            });
            expect(result).toEqual(expectedItems);
        });

        it('응답이 비어있으면 빈 배열을 반환한다', async () => {
            mockBridge.request.mockResolvedValueOnce({ data: null } as any);
            const result = await adapter.loadAll();
            expect(result).toEqual([]);
        });
    });

    describe('delete & deleteAll & clearAll', () => {
        it('delete는 정확한 id와 scope로 DeleteCacheData를 요청한다', async () => {
            await adapter.delete('chat-1');
            expect(mockBridge.request).toHaveBeenCalledWith({
                type: 'DeleteCacheData',
                data: { type: 'chat', cid: mockScope.cid, uid: mockScope.uid, id: 'chat-1' },
            });
        });

        it('deleteAll은 배열이 비어있으면 요청을 생략한다', async () => {
            await adapter.deleteAll([]);
            expect(mockBridge.request).not.toHaveBeenCalled();
        });

        it('deleteAll은 ids 배열로 DeleteAllCacheData를 요청한다', async () => {
            await adapter.deleteAll(['chat-1', 'chat-2']);
            expect(mockBridge.request).toHaveBeenCalledWith({
                type: 'DeleteAllCacheData',
                data: { type: 'chat', cid: mockScope.cid, uid: mockScope.uid, ids: ['chat-1', 'chat-2'] },
            });
        });

        it('clearAll은 도메인과 scope 정보로 ClearCacheData를 요청한다', async () => {
            await adapter.clearAll();
            expect(mockBridge.request).toHaveBeenCalledWith({
                type: 'ClearCacheData',
                data: { type: 'chat', cid: mockScope.cid, uid: mockScope.uid },
            });
        });
    });

    describe('loadMany', () => {
        beforeEach(() => {
            resetNativeBatchReadSupport();
        });

        it('빈 배열이면 브릿지를 호출하지 않는다', async () => {
            const result = await adapter.loadMany([]);
            expect(result).toEqual([]);
            expect(mockBridge.request).not.toHaveBeenCalled();
        });

        it('id가 몇 개든 FetchManyCacheData 한 번으로 읽는다', async () => {
            mockBridge.request.mockResolvedValue({
                data: { type: 'chat', items: [{ id: 'chat-2' }, { id: 'chat-1' }] },
            } as any);

            const result = await adapter.loadMany(['chat-1', 'chat-2', 'chat-3']);

            expect(mockBridge.request).toHaveBeenCalledTimes(1);
            expect(mockBridge.request).toHaveBeenCalledWith({
                type: 'FetchManyCacheData',
                data: {
                    type: 'chat',
                    cid: mockScope.cid,
                    uid: mockScope.uid,
                    ids: ['chat-1', 'chat-2', 'chat-3'],
                },
            });
            // 네이티브가 준 순서를 그대로 돌려줍니다 — 요청 순서로 재정렬하지 않습니다.
            expect(result).toEqual([{ id: 'chat-2' }, { id: 'chat-1' }]);
        });

        it('items가 null이면(네이티브 내부 오류) 빈 배열로 답한다', async () => {
            mockBridge.request.mockResolvedValue({ data: { type: 'chat', items: null } } as any);
            await expect(adapter.loadMany(['chat-1'])).resolves.toEqual([]);
        });

        it('핸들러가 없는 구버전 앱(NOT_FOUND)에서는 id별 조회로 폴백한다', async () => {
            mockBridge.request.mockImplementation((message: any) => {
                if (message.type === 'FetchManyCacheData') return Promise.reject({ code: 'NOT_FOUND' });
                return Promise.resolve({
                    data: { type: 'chat', id: message.data.id, item: { id: message.data.id } },
                } as any);
            });

            const result = await adapter.loadMany(['chat-1', 'chat-2']);

            expect(result).toEqual([{ id: 'chat-1' }, { id: 'chat-2' }]);
            expect(mockBridge.request).toHaveBeenCalledWith(expect.objectContaining({ type: 'FetchManyCacheData' }));
            expect(mockBridge.request).toHaveBeenCalledWith(expect.objectContaining({ type: 'FetchCacheData' }));
        });

        it('폴백을 한 번 배우면 이후에는 배치 요청을 시도하지 않는다', async () => {
            mockBridge.request.mockImplementation((message: any) => {
                if (message.type === 'FetchManyCacheData') return Promise.reject({ code: 'NOT_FOUND' });
                return Promise.resolve({ data: { type: 'chat', id: message.data.id, item: null } } as any);
            });

            await adapter.loadMany(['chat-1']);
            mockBridge.request.mockClear();
            await adapter.loadMany(['chat-2']);

            expect(mockBridge.request).not.toHaveBeenCalledWith(
                expect.objectContaining({ type: 'FetchManyCacheData' })
            );
        });

        it('NOT_FOUND가 아닌 실패는 폴백으로 감추지 않고 그대로 던진다', async () => {
            // 타임아웃을 폴백으로 감추면 왕복이 2배가 되면서 원인도 숨습니다.
            mockBridge.request.mockRejectedValue({ code: 'TIMEOUT' });

            await expect(adapter.loadMany(['chat-1'])).rejects.toEqual({ code: 'TIMEOUT' });
            expect(mockBridge.request).toHaveBeenCalledTimes(1);
        });
    });

    describe('loadLastPerChannel (ADR-0057)', () => {
        beforeEach(() => {
            resetNativeLastChatsSupport();
        });

        it('chat 스코프로 FetchLastChatsData를 요청하고 items를 그대로 돌려준다', async () => {
            const items = [{ channelId: 'ch-1', lastNo: 3, item: { id: 'm3' } }];
            mockBridge.request.mockResolvedValue({ data: { type: 'chat', items } } as any);

            const result = await adapter.loadLastPerChannel(['ch-1', 'ch-2']);

            expect(mockBridge.request).toHaveBeenCalledWith({
                type: 'FetchLastChatsData',
                data: { type: 'chat', cid: mockScope.cid, uid: mockScope.uid, channelIds: ['ch-1', 'ch-2'] },
            });
            expect(result).toEqual(items);
        });

        it('chat이 아닌 타입은 브릿지를 부르지 않고 폴백(null)한다', async () => {
            const channelAdapter = new NativeDBAdapter<'channel'>(mockBridge, 'channel', mockContextProvider);
            await expect(channelAdapter.loadLastPerChannel(['ch-1'])).resolves.toBeNull();
            expect(mockBridge.request).not.toHaveBeenCalled();
        });

        it('빈 채널 목록이면 브릿지를 부르지 않는다', async () => {
            await expect(adapter.loadLastPerChannel([])).resolves.toEqual([]);
            expect(mockBridge.request).not.toHaveBeenCalled();
        });

        it('items가 null이면(네이티브 내부 오류) 이번 읽기만 폴백하고 학습하지 않는다', async () => {
            mockBridge.request.mockResolvedValue({ data: { type: 'chat', items: null } } as any);

            await expect(adapter.loadLastPerChannel(['ch-1'])).resolves.toBeNull();
            await adapter.loadLastPerChannel(['ch-1']);

            // 학습하지 않았으므로 두 번째 읽기도 다시 시도한다.
            expect(mockBridge.request).toHaveBeenCalledTimes(2);
        });

        it('핸들러가 없는 구버전 앱(NOT_FOUND)은 한 번으로 배우고 이후 시도하지 않는다', async () => {
            mockBridge.request.mockRejectedValue({ code: 'NOT_FOUND' });

            await expect(adapter.loadLastPerChannel(['ch-1'])).resolves.toBeNull();
            mockBridge.request.mockClear();
            await expect(adapter.loadLastPerChannel(['ch-2'])).resolves.toBeNull();

            expect(mockBridge.request).not.toHaveBeenCalled();
        });

        it('타임아웃 등 다른 실패는 던지지 않고 null로 답하되 학습하지 않는다', async () => {
            // 이 조회의 실패 시 정답은 언제나 윈도우 폴백이므로 throw 대신 null — 단 일시
            // 오류를 미지원으로 새기면 앱 배포 후에도 fast path가 영영 죽으므로 학습은 금지.
            mockBridge.request.mockRejectedValue({ code: 'TIMEOUT' });

            await expect(adapter.loadLastPerChannel(['ch-1'])).resolves.toBeNull();
            await adapter.loadLastPerChannel(['ch-1']);

            expect(mockBridge.request).toHaveBeenCalledTimes(2);
        });
    });

    describe('in-flight 읽기 중복 제거', () => {
        it('같은 loadAll이 동시에 두 번 요청되면 왕복은 한 번만 난다', async () => {
            // 논리 키가 다른 두 옵저버가 같은 물리 쿼리(인자 없는 loadAll)를 내보내는 실제 상황.
            let resolveRequest: (value: unknown) => void = () => undefined;
            mockBridge.request.mockReturnValue(
                new Promise(resolve => {
                    resolveRequest = resolve;
                }) as any
            );

            const first = adapter.loadAll();
            const second = adapter.loadAll();
            resolveRequest({ data: { type: 'chat', items: [{ id: 'chat-1' }] } });

            expect(await first).toEqual([{ id: 'chat-1' }]);
            expect(await second).toEqual([{ id: 'chat-1' }]);
            expect(mockBridge.request).toHaveBeenCalledTimes(1);
        });

        it('앞선 요청이 끝난 뒤의 같은 요청은 새로 나간다 (캐시가 아니다)', async () => {
            mockBridge.request.mockResolvedValue({ data: { type: 'chat', items: [] } } as any);

            await adapter.loadAll();
            await adapter.loadAll();

            expect(mockBridge.request).toHaveBeenCalledTimes(2);
        });

        it('페이로드가 다르면 합치지 않는다', async () => {
            mockBridge.request.mockResolvedValue({ data: { type: 'chat', id: 'x', item: null } } as any);

            await Promise.all([adapter.load('chat-1'), adapter.load('chat-2')]);

            expect(mockBridge.request).toHaveBeenCalledTimes(2);
        });

        it('쓰기는 합치지 않는다 — 두 번째 호출자가 자기 쓰기가 반영됐다고 믿으면 안 된다', async () => {
            mockBridge.request.mockResolvedValue({ data: { type: 'chat', id: 'chat-1', success: true } } as any);

            await Promise.all([
                adapter.save('chat-1', { id: 'chat-1' } as any),
                adapter.save('chat-1', { id: 'chat-1' } as any),
            ]);

            expect(mockBridge.request).toHaveBeenCalledTimes(2);
        });

        it('실패한 읽기도 공유하지만, 다음 호출은 새로 나간다', async () => {
            mockBridge.request.mockRejectedValueOnce({ code: 'TIMEOUT' });

            const [first, second] = await Promise.allSettled([adapter.loadAll(), adapter.loadAll()]);

            expect(first.status).toBe('rejected');
            expect(second.status).toBe('rejected');
            expect(mockBridge.request).toHaveBeenCalledTimes(1);

            mockBridge.request.mockResolvedValue({ data: { type: 'chat', items: [] } } as any);
            await expect(adapter.loadAll()).resolves.toEqual([]);
            expect(mockBridge.request).toHaveBeenCalledTimes(2);
        });
    });
});
