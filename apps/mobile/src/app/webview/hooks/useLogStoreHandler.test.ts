import { renderHook } from '@testing-library/react';
import { logHub } from '@chatic/logger';

import { useLogStoreHandler } from './useLogStoreHandler';

import type { WebMessageData } from '@chatic/app-messages';
import type { LogEntry } from '@chatic/logger';

const mockLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

/** Stand-in for the real service — the store's own contract is covered by its unit test. */
const createQueueStub = () => {
    const held: LogEntry[] = [];
    return {
        held,
        /** Seeds the stub the way the real store fills: off the hub. */
        seed: (entry: LogEntry) => held.push(entry),
        fetch: jest.fn((limit?: number) => held.slice(0, limit ?? held.length)),
        ack: jest.fn(() => 0),
        clear: jest.fn(() => 0),
        getSize: jest.fn(() => held.length),
    };
};

let queue = createQueueStub();

jest.mock('../../hooks', () => ({
    useServices: () => ({
        logUploadQueueService: queue,
        logService: mockLogger,
    }),
}));

/**
 * The merged ring buffer is gone, so the all-levels destination of a relayed
 * entry is the hub itself: publishing there is what reaches the app's other
 * subscribers — the Crashlytics breadcrumb sink (no level filter, so it takes
 * `debug` too) and the dev-only console mirror. A hub subscriber therefore
 * stands in for what used to be `logBuffer.peek()`, and it has to be installed
 * before the handler runs.
 */
let hubEntries: LogEntry[] = [];
let unsubscribeHub: () => void = () => undefined;

const watchHub = () => {
    hubEntries = [];
    unsubscribeHub = logHub.subscribe(entry => hubEntries.push(entry));
};

describe('useLogStoreHandler — 배출', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        queue = createQueueStub();
        watchHub();
    });

    afterEach(() => {
        unsubscribeHub();
    });

    it('fetch는 비파괴다 — 큐를 줄이지도, hub에 다시 발행하지도 않는다', async () => {
        const { result } = renderHook(() => useLogStoreHandler());
        queue.seed({ level: 'info', tag: 'TEST', message: 'a', timestamp: 1 });
        const beforePublished = hubEntries.length;
        const beforeSize = queue.getSize();

        await result.current.handleFetchLogUploadQueue({
            type: 'FetchLogUploadQueue',
            data: { limit: 10 },
        } as WebMessageData<'FetchLogUploadQueue'>);

        expect(queue.getSize()).toBe(beforeSize);
        expect(hubEntries).toHaveLength(beforePublished);
    });

    it('fetch 응답에 큐 전체 크기를 함께 준다', async () => {
        const { result } = renderHook(() => useLogStoreHandler());
        queue.seed({ level: 'info', tag: 'TEST', message: 'a', timestamp: 1 });

        const res = await result.current.handleFetchLogUploadQueue({
            type: 'FetchLogUploadQueue',
            data: {},
        } as WebMessageData<'FetchLogUploadQueue'>);

        expect(res).toMatchObject({ type: 'OnFetchLogUploadQueue', success: true, data: { size: 1 } });
    });

    it('ack은 ids를 큐로 넘기고 남은 크기를 답한다', async () => {
        const { result } = renderHook(() => useLogStoreHandler());

        const res = await result.current.handleAckLogUploadQueue({
            type: 'AckLogUploadQueue',
            data: { ids: ['a', 'b'] },
        } as WebMessageData<'AckLogUploadQueue'>);

        expect(queue.ack).toHaveBeenCalledWith(['a', 'b']);
        expect(res).toMatchObject({ type: 'OnAckLogUploadQueue', success: true, data: { size: 0 } });
    });

    it('ids가 없으면 빈 배열로 넘긴다', async () => {
        const { result } = renderHook(() => useLogStoreHandler());

        await result.current.handleAckLogUploadQueue({
            type: 'AckLogUploadQueue',
            data: {},
        } as WebMessageData<'AckLogUploadQueue'>);

        expect(queue.ack).toHaveBeenCalledWith([]);
    });

    it('clear는 전송 큐만 건드린다 — opt-out은 기기를 나가는 것에 관한 것이다', async () => {
        const { result } = renderHook(() => useLogStoreHandler());
        queue.seed({ level: 'info', tag: 'TEST', message: 'a', timestamp: 1 });

        const res = await result.current.handleClearLogUploadQueue({
            type: 'ClearLogUploadQueue',
            data: {},
        } as WebMessageData<'ClearLogUploadQueue'>);

        expect(queue.clear).toHaveBeenCalledTimes(1);
        // 남은 불변식은 clear가 hub 쪽에 손대지 않는다는 것 — 무엇도 발행하지 않고,
        // 이미 배달된 엔트리를 되돌리지도 않는다. 저장소를 비우는 것과 다른
        // 리스너들이 이미 본 것은 별개다.
        expect(hubEntries).toHaveLength(0);
        expect(res).toMatchObject({ type: 'OnClearLogUploadQueue', success: true, data: { size: 0 } });
    });
});

describe('useLogStoreHandler — 실패', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        queue = createQueueStub();
        watchHub();
    });

    afterEach(() => {
        unsubscribeHub();
    });

    it('저장소가 던지면 에러 응답을 주고 예외를 흘리지 않는다', async () => {
        queue.fetch.mockImplementation(() => {
            throw new Error('mmkv full');
        });
        const { result } = renderHook(() => useLogStoreHandler());

        const res = await result.current.handleFetchLogUploadQueue({
            type: 'FetchLogUploadQueue',
            data: {},
        } as WebMessageData<'FetchLogUploadQueue'>);

        expect(res).toMatchObject({ success: false, error: { code: 'LOG_ERROR', message: 'mmkv full' } });
    });
});
