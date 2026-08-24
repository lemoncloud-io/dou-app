import { renderHook } from '@testing-library/react';
import { logBuffer } from '@chatic/logger';

import { useLogBatchHandler } from './useLogBatchHandler';

import type { WebMessageData } from '@chatic/app-messages';
import type { LogEntry } from '@chatic/logger';

const mockLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

/** Stand-in for the real service — the queue's own contract is covered by its unit test. */
const createQueueStub = () => {
    const charged: LogEntry[] = [];
    return {
        charged,
        charge: jest.fn((entries: LogEntry[]) => {
            const shippable = entries.filter(entry => entry.level !== 'debug');
            charged.push(...shippable);
            return { accepted: shippable.length, size: charged.length };
        }),
        fetch: jest.fn((limit?: number) => charged.slice(0, limit ?? charged.length)),
        ack: jest.fn(() => 0),
        clear: jest.fn(() => 0),
        getSize: jest.fn(() => charged.length),
    };
};

let queue = createQueueStub();

jest.mock('../../hooks', () => ({
    useServices: () => ({
        logUploadQueueService: queue,
        logService: mockLogger,
    }),
}));

const batch = (logs: unknown[]): WebMessageData<'SendLogBatch'> =>
    ({ type: 'SendLogBatch', data: { logs } }) as WebMessageData<'SendLogBatch'>;

describe('useLogBatchHandler — 충전 수신', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        queue = createQueueStub();
        logBuffer.clear();
    });

    it('전 레벨을 링버퍼에, 비-debug만 전송 큐에 넣는다', async () => {
        const { result } = renderHook(() => useLogBatchHandler());

        await result.current.handleSendLogBatch(
            batch([
                { level: 'debug', tag: 'NET', message: 'GET /a', timestamp: 1 },
                { level: 'error', tag: 'NET', message: 'GET /b failed', timestamp: 2 },
            ])
        );

        // breadcrumb은 전부 — debug가 크래시 조사에서 가장 필요한 문맥이다.
        expect(logBuffer.peek().map(item => item.level)).toEqual(['debug', 'error']);
        // 서버로 갈 큐는 비-debug만.
        expect(queue.charged.map(item => item.level)).toEqual(['error']);
    });

    it('원본 tag·발생 시각·source를 재스탬프하지 않는다', async () => {
        const { result } = renderHook(() => useLogBatchHandler());

        await result.current.handleSendLogBatch(
            batch([{ id: 'x', level: 'warn', tag: 'SOCKET', message: 'm', timestamp: 1234, source: 'web' }])
        );

        expect(logBuffer.peek()[0]).toMatchObject({ tag: 'SOCKET', timestamp: 1234, source: 'web' });
    });

    it('timestamp·tag·source가 없으면 폴백한다 — 구버전 웹 호환', async () => {
        const { result } = renderHook(() => useLogBatchHandler());

        await result.current.handleSendLogBatch(batch([{ message: 'legacy' }]));

        expect(logBuffer.peek()[0]).toMatchObject({ tag: 'WEBVIEW', level: 'info', source: 'web' });
        expect(logBuffer.peek()[0].timestamp).toEqual(expect.any(Number));
    });

    it('적재 건수와 큐 크기를 응답에 실어 보낸다 — 웹의 업로드 크기 트리거', async () => {
        const { result } = renderHook(() => useLogBatchHandler());

        const res = await result.current.handleSendLogBatch(
            batch([
                { level: 'debug', message: 'a', timestamp: 1 },
                { level: 'info', message: 'b', timestamp: 2 },
            ])
        );

        expect(res).toMatchObject({ type: 'OnSendLogBatch', success: true, data: { accepted: 1, size: 1 } });
    });

    it('빈 배치도 성공으로 답한다', async () => {
        const { result } = renderHook(() => useLogBatchHandler());

        const res = await result.current.handleSendLogBatch(batch([]));

        expect(res).toMatchObject({ success: true, data: { accepted: 0, size: 0 } });
    });
});

describe('useLogBatchHandler — 배출', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        queue = createQueueStub();
        logBuffer.clear();
    });

    it('fetch는 링버퍼를 건드리지 않는다 — 4번 원칙 회귀 방어', async () => {
        const { result } = renderHook(() => useLogBatchHandler());
        await result.current.handleSendLogBatch(batch([{ level: 'info', message: 'a', timestamp: 1 }]));
        const before = logBuffer.size();

        await result.current.handleFetchLogUploadQueue({
            type: 'FetchLogUploadQueue',
            data: { limit: 10 },
        } as WebMessageData<'FetchLogUploadQueue'>);

        expect(logBuffer.size()).toBe(before);
    });

    it('fetch 응답에 큐 전체 크기를 함께 준다', async () => {
        const { result } = renderHook(() => useLogBatchHandler());
        await result.current.handleSendLogBatch(batch([{ level: 'info', message: 'a', timestamp: 1 }]));

        const res = await result.current.handleFetchLogUploadQueue({
            type: 'FetchLogUploadQueue',
            data: {},
        } as WebMessageData<'FetchLogUploadQueue'>);

        expect(res).toMatchObject({ type: 'OnFetchLogUploadQueue', success: true, data: { size: 1 } });
    });

    it('ack은 ids를 큐로 넘기고 남은 크기를 답한다', async () => {
        const { result } = renderHook(() => useLogBatchHandler());

        const res = await result.current.handleAckLogUploadQueue({
            type: 'AckLogUploadQueue',
            data: { ids: ['a', 'b'] },
        } as WebMessageData<'AckLogUploadQueue'>);

        expect(queue.ack).toHaveBeenCalledWith(['a', 'b']);
        expect(res).toMatchObject({ type: 'OnAckLogUploadQueue', success: true, data: { size: 0 } });
    });

    it('ids가 없으면 빈 배열로 넘긴다', async () => {
        const { result } = renderHook(() => useLogBatchHandler());

        await result.current.handleAckLogUploadQueue({
            type: 'AckLogUploadQueue',
            data: {},
        } as WebMessageData<'AckLogUploadQueue'>);

        expect(queue.ack).toHaveBeenCalledWith([]);
    });

    it('clear는 전송 큐만 비우고 링버퍼는 남긴다 — opt-out은 기기를 나가는 것에 관한 것이다', async () => {
        const { result } = renderHook(() => useLogBatchHandler());
        await result.current.handleSendLogBatch(batch([{ level: 'info', message: 'a', timestamp: 1 }]));

        const res = await result.current.handleClearLogUploadQueue({
            type: 'ClearLogUploadQueue',
            data: {},
        } as WebMessageData<'ClearLogUploadQueue'>);

        expect(queue.clear).toHaveBeenCalledTimes(1);
        expect(logBuffer.size()).toBe(1);
        expect(res).toMatchObject({ type: 'OnClearLogUploadQueue', success: true, data: { size: 0 } });
    });
});

describe('useLogBatchHandler — 실패', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        queue = createQueueStub();
        logBuffer.clear();
    });

    it('큐가 던지면 에러 응답을 주고 예외를 흘리지 않는다', async () => {
        queue.charge.mockImplementation(() => {
            throw new Error('mmkv full');
        });
        const { result } = renderHook(() => useLogBatchHandler());

        const res = await result.current.handleSendLogBatch(batch([{ level: 'info', message: 'a', timestamp: 1 }]));

        expect(res).toMatchObject({ success: false, error: { code: 'LOG_ERROR', message: 'mmkv full' } });
    });
});
