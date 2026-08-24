import {
    chargeNativeLogQueue,
    clearNativeLogQueue,
    createNativeUploadSource,
    isNativeUploadQueueUnsupported,
    resetNativeUploadQueueSupport,
} from './nativeUploadSource';

import { isBatchRelayActive, resetBatchRelay } from '@chatic/bridges';

import type { LogEntry } from '@chatic/bridges';

const mockSendLogBatch = jest.fn();
const mockFetchLogUploadQueue = jest.fn();
const mockAckLogUploadQueue = jest.fn();
const mockClearLogUploadQueue = jest.fn();

jest.mock('./appBridge', () => ({
    appBridge: {
        sendLogBatch: (...args: unknown[]) => mockSendLogBatch(...args),
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
    resetBatchRelay();
    jest.spyOn(console, 'warn').mockImplementation();
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('nativeUploadSource — 충전', () => {
    it('앱 큐 크기를 돌려줘 웹의 크기 트리거가 되게 한다', async () => {
        mockSendLogBatch.mockResolvedValue({ success: true, data: { accepted: 2, size: 7 } });

        await expect(chargeNativeLogQueue([entry(), entry({ id: 'id-2' })])).resolves.toBe(7);
    });

    it('성공하면 건당 릴레이를 세운다 — 두 경로가 같은 링버퍼에 이중 적재된다', async () => {
        mockSendLogBatch.mockResolvedValue({ success: true, data: { accepted: 1, size: 1 } });

        await chargeNativeLogQueue([entry()]);

        expect(isBatchRelayActive()).toBe(true);
    });

    it('실패하면 건당 릴레이를 그대로 둔다 — 구버전 앱은 그 경로뿐이다', async () => {
        mockSendLogBatch.mockResolvedValue({ success: false });

        await chargeNativeLogQueue([entry()]);

        expect(isBatchRelayActive()).toBe(false);
    });

    it('빈 배치는 브리지를 두드리지 않는다', async () => {
        await chargeNativeLogQueue([]);

        expect(mockSendLogBatch).not.toHaveBeenCalled();
    });

    it('실패하면 undefined를 돌려준다 — 호출자가 엔트리를 계속 들고 있어야 한다', async () => {
        mockSendLogBatch.mockResolvedValue({ success: false });

        await expect(chargeNativeLogQueue([entry()])).resolves.toBeUndefined();
    });
});

describe('nativeUploadSource — NOT_FOUND learn-once (구버전 앱)', () => {
    it('NOT_FOUND를 한 번 받으면 이후로는 브리지를 두드리지 않는다', async () => {
        mockFetchLogUploadQueue.mockRejectedValue(notFound());
        const source = createNativeUploadSource();

        await source.fetch(50);
        await source.fetch(50);
        await source.fetch(50);

        // 첫 거절만 실제 왕복이다 — 나머지는 학습된 폴백이 막는다.
        expect(mockFetchLogUploadQueue).toHaveBeenCalledTimes(1);
        expect(isNativeUploadQueueUnsupported()).toBe(true);
    });

    it('충전에서 배운 것이 조회에도 적용된다 — 앱은 하나이므로 답도 하나다', async () => {
        mockSendLogBatch.mockRejectedValue(notFound());
        const source = createNativeUploadSource();

        await chargeNativeLogQueue([entry()]);
        await source.fetch(50);

        expect(mockFetchLogUploadQueue).not.toHaveBeenCalled();
    });

    it('타임아웃은 학습하지 않는다 — 일시적 실패를 영구 판정으로 바꾸면 세션 내내 앱 큐가 고립된다', async () => {
        mockFetchLogUploadQueue.mockRejectedValue(Object.assign(new Error('timed out'), { code: 'TIMEOUT' }));
        const source = createNativeUploadSource();

        await source.fetch(50);
        await source.fetch(50);

        expect(mockFetchLogUploadQueue).toHaveBeenCalledTimes(2);
        expect(isNativeUploadQueueUnsupported()).toBe(false);
    });

    it('코드 없는 에러도 학습하지 않는다', async () => {
        mockFetchLogUploadQueue.mockRejectedValue(new Error('boom'));
        const source = createNativeUploadSource();

        await source.fetch(50);

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

        await expect(source.fetch(50)).resolves.toEqual([
            expect.objectContaining({ id: 'a', level: 'warn', tag: 'NET', timestamp: 9 }),
        ]);
    });

    it('실패한 조회는 빈 배치다 — 소스는 아무것도 놓아주지 않았다', async () => {
        mockFetchLogUploadQueue.mockResolvedValue({ success: false });
        const source = createNativeUploadSource();

        await expect(source.fetch(50)).resolves.toEqual([]);
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

    it('pendingSize는 답하지 않는다 — 로그마다 왕복하면 배치의 의미가 사라진다', () => {
        expect(createNativeUploadSource().pendingSize?.()).toBeUndefined();
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
