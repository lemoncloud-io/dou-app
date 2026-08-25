import {
    clearNativeLogQueue,
    createNativeUploadSource,
    isNativeUploadQueueUnsupported,
    resetNativeUploadQueueSupport,
} from './nativeUploadSource';

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

const notFound = () => Object.assign(new Error('no handler'), { code: 'NOT_FOUND' });

beforeEach(() => {
    jest.clearAllMocks();
    resetNativeUploadQueueSupport();
    jest.spyOn(console, 'warn').mockImplementation();
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('nativeUploadSource — NOT_FOUND learn-once (구버전 앱)', () => {
    it('NOT_FOUND를 한 번 받으면 이후로는 브리지를 두드리지 않는다', async () => {
        mockFetchLogUploadQueue.mockRejectedValue(notFound());
        const source = createNativeUploadSource();

        await source.peek(50);
        await source.peek(50);
        await source.peek(50);

        // 첫 거절만 실제 왕복이다 — 나머지는 학습된 폴백이 막는다.
        expect(mockFetchLogUploadQueue).toHaveBeenCalledTimes(1);
        expect(isNativeUploadQueueUnsupported()).toBe(true);
    });

    it('조회에서 배운 것이 ack에도 적용된다 — 앱은 하나이므로 답도 하나다', async () => {
        mockFetchLogUploadQueue.mockRejectedValue(notFound());
        const source = createNativeUploadSource();

        await source.peek(50);
        await source.ack([entry()]);

        expect(mockAckLogUploadQueue).not.toHaveBeenCalled();
    });

    it('타임아웃은 학습하지 않는다 — 일시적 실패를 영구 판정으로 바꾸면 세션 내내 앱 큐가 고립된다', async () => {
        mockFetchLogUploadQueue.mockRejectedValue(Object.assign(new Error('timed out'), { code: 'TIMEOUT' }));
        const source = createNativeUploadSource();

        await source.peek(50);
        await source.peek(50);

        expect(mockFetchLogUploadQueue).toHaveBeenCalledTimes(2);
        expect(isNativeUploadQueueUnsupported()).toBe(false);
    });

    it('코드 없는 에러도 학습하지 않는다', async () => {
        mockFetchLogUploadQueue.mockRejectedValue(new Error('boom'));
        const source = createNativeUploadSource();

        await source.peek(50);

        expect(isNativeUploadQueueUnsupported()).toBe(false);
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
        // 모니터 표시용이라 한 주기 늦어도 된다. 매번 브리지를 두드리면 값 하나에
        // 왕복 하나를 쓰게 되고, 그걸 읽고 결정하는 주체는 아무도 없다.
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

    it('구버전 앱에서는 조용히 넘어간다', async () => {
        mockClearLogUploadQueue.mockRejectedValue(notFound());

        await expect(clearNativeLogQueue()).resolves.toBeUndefined();
        expect(isNativeUploadQueueUnsupported()).toBe(true);
    });
});
