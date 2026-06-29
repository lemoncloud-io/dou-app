import { NativeDBAdapter } from './NativeDBAdapter';
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
});
