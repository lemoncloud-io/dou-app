import { clearNativeLogQueue, createNativeUploadSource, resetNativeUploadQueueSize } from './nativeUploadSource';

import type { LogEntry } from '@chatic/bridges';

const mockFetchLogUploadQueue = jest.fn();
const mockAckLogUploadQueue = jest.fn();
const mockClearLogUploadQueue = jest.fn();

jest.mock('../../bridge/appBridge', () => ({
    appBridge: {
        fetchLogUploadQueue: (...args: unknown[]) => mockFetchLogUploadQueue(...args),
        ackLogUploadQueue: (...args: unknown[]) => mockAckLogUploadQueue(...args),
        clearLogUploadQueue: (...args: unknown[]) => mockClearLogUploadQueue(...args),
    },
}));

const entry = (over: Partial<LogEntry> = {}): LogEntry => ({
    id: over.id ?? 'id-1',
    level: over.level ?? 'info',
    tag: over.tag ?? 'TEST',
    message: over.message ?? 'msg',
    timestamp: over.timestamp ?? 1,
    ...over,
});

beforeEach(() => {
    jest.clearAllMocks();
    resetNativeUploadQueueSize();
    jest.spyOn(console, 'warn').mockImplementation();
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('nativeUploadSource — failures', () => {
    it('asks again after a failed read — a failure is never a verdict on the app', async () => {
        mockFetchLogUploadQueue.mockRejectedValue(Object.assign(new Error('timed out'), { code: 'TIMEOUT' }));
        const source = createNativeUploadSource();

        await expect(source.peek(50)).resolves.toEqual([]);
        await source.peek(50);

        expect(mockFetchLogUploadQueue).toHaveBeenCalledTimes(2);
    });
});

describe('nativeUploadSource — 배출', () => {
    it('조회 결과를 LogEntry로 정규화한다', async () => {
        mockFetchLogUploadQueue.mockResolvedValue({
            success: true,
            data: { logs: [{ id: 'a', level: 'warn', tag: 'NET', message: 'm', timestamp: 9 }], size: 1 },
        });
        const source = createNativeUploadSource();

        await expect(source.peek(50)).resolves.toEqual([
            expect.objectContaining({ id: 'a', level: 'warn', tag: 'NET', timestamp: 9 }),
        ]);
    });

    it('실패한 조회는 빈 배치다 — 소스는 아무것도 놓아주지 않았다', async () => {
        mockFetchLogUploadQueue.mockResolvedValue({ success: false });
        const source = createNativeUploadSource();

        await expect(source.peek(50)).resolves.toEqual([]);
    });

    it('ack은 id만 실어 보낸다', async () => {
        mockAckLogUploadQueue.mockResolvedValue({ success: true, data: { size: 0 } });
        const source = createNativeUploadSource();

        await source.ack([entry({ id: 'a' }), entry({ id: 'b' })]);

        expect(mockAckLogUploadQueue).toHaveBeenCalledWith(['a', 'b']);
    });

    it('id 없는 엔트리만 있으면 ack을 보내지 않는다', async () => {
        const source = createNativeUploadSource();

        await source.ack([{ level: 'info', tag: 'T', message: 'm', timestamp: 1 }]);

        expect(mockAckLogUploadQueue).not.toHaveBeenCalled();
    });

    it('ack 실패는 던지지 않는다 — 엔트리가 앱에 남아 다음 배치를 탄다', async () => {
        mockAckLogUploadQueue.mockRejectedValue(new Error('bridge down'));
        const source = createNativeUploadSource();

        await expect(source.ack([entry()])).resolves.toBeUndefined();
    });

    it('size는 마지막 왕복이 보고한 값을 돌려준다 — 읽을 때마다 묻지 않는다', async () => {
        // This is for monitor display, so being one cycle stale is fine. Hitting the bridge on every
        // read would spend a round trip per value, and there's no one reading it to act on it anyway.
        const source = createNativeUploadSource();
        expect(source.size()).toBe(0);

        mockFetchLogUploadQueue.mockResolvedValueOnce({ success: true, data: { logs: [], size: 12 } });
        await source.peek(50);

        expect(source.size()).toBe(12);
    });
});

describe('nativeUploadSource — opt-out', () => {
    it('clear는 앱 큐 폐기를 요청한다', async () => {
        mockClearLogUploadQueue.mockResolvedValue({ success: true, data: { size: 0 } });

        await clearNativeLogQueue();

        expect(mockClearLogUploadQueue).toHaveBeenCalledTimes(1);
    });

    it('passes over a failed clear quietly', async () => {
        mockClearLogUploadQueue.mockRejectedValue(new Error('bridge down'));

        await expect(clearNativeLogQueue()).resolves.toBeUndefined();
    });
});
