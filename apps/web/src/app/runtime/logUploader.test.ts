import { logBuffer, logger } from '@chatic/bridges';

import { startLogUploader } from './logUploader';

import type { LogEntry } from '@chatic/bridges';
import type { LogUploaderHandle } from './logUploader';

/**
 * Boundaries are mocked; the queue, the scheduler and the hub are real. The
 * thing under test here is the wiring — which source answers, when a charge
 * happens, what the opt-out clears — and a mocked queue would assert the mock.
 */

let mockIsNative = false;

jest.mock('@chatic/bridges', () => ({
    ...jest.requireActual('@chatic/bridges'),
    isNative: () => mockIsNative,
}));

let collectionEnabled = true;
jest.mock('./logUploadSwitch', () => ({
    isLogCollectionEnabled: () => collectionEnabled,
    createLogUploadSwitch: () => () => collectionEnabled,
}));

let stored: LogEntry[] = [];
jest.mock('./logUploadStore', () => ({
    resolveTabId: () => 'tab-1',
    createLogUploadStore: () => ({
        load: () => stored,
        save: (entries: LogEntry[]) => {
            stored = entries;
        },
        start: () => () => undefined,
    }),
}));

let unsupported = false;
let appQueue: LogEntry[] = [];
const mockCharge = jest.fn(async (entries: LogEntry[]) => {
    appQueue.push(...entries.filter(entry => entry.level !== 'debug'));
    return appQueue.length;
});
const mockClearNative = jest.fn(async () => {
    appQueue = [];
});
jest.mock('../bridge/nativeUploadSource', () => ({
    isNativeUploadQueueUnsupported: () => unsupported,
    chargeNativeLogQueue: (entries: LogEntry[]) => mockCharge(entries),
    clearNativeLogQueue: () => mockClearNative(),
    createNativeUploadSource: () => ({
        fetch: async (limit: number) => appQueue.slice(0, limit),
        ack: async (entries: LogEntry[]) => {
            appQueue = appQueue.filter(item => !entries.includes(item));
        },
        pendingSize: () => undefined,
    }),
}));

const mockUpload = jest.fn(async () => 'ok' as const);
jest.mock('@chatic/web-core', () => ({
    uploadLogBatch: (entries: LogEntry[]) => mockUpload(entries),
    registerSessionLogoutCallback: () => () => undefined,
}));

let handle: LogUploaderHandle | undefined;

beforeEach(() => {
    jest.clearAllMocks();
    mockIsNative = false;
    collectionEnabled = true;
    unsupported = false;
    stored = [];
    appQueue = [];
    logBuffer.clear();
    jest.spyOn(console, 'warn').mockImplementation();
});

afterEach(() => {
    handle?.teardown();
    handle = undefined;
    jest.restoreAllMocks();
});

const sentBatches = () => mockUpload.mock.calls.map(([entries]) => entries as unknown as LogEntry[]);

describe('startLogUploader — 웹 단독', () => {
    it('충전 없이 웹 큐에서 바로 보낸다', async () => {
        handle = startLogUploader();
        logger.info('TEST', 'standalone');

        await handle.flush();

        expect(mockCharge).not.toHaveBeenCalled();
        expect(sentBatches()[0].map(entry => entry.message)).toContain('standalone');
    });

    it('debug는 큐에 들어가지 않으므로 배치에도 없다', async () => {
        handle = startLogUploader();
        logger.debug('TEST', 'noisy');
        logger.info('TEST', 'kept');

        await handle.flush();

        const messages = sentBatches()[0].map(entry => entry.message);
        expect(messages).toContain('kept');
        expect(messages).not.toContain('noisy');
    });
});

describe('startLogUploader — 하이브리드', () => {
    beforeEach(() => {
        mockIsNative = true;
    });

    it('flush는 충전 후 전송한다 — 앱이 못 받은 엔트리는 앱에서 꺼낼 수 없다', async () => {
        handle = startLogUploader();
        logger.info('TEST', 'hybrid');

        await handle.flush();

        expect(mockCharge).toHaveBeenCalledTimes(1);
        expect(sentBatches()[0].map(entry => entry.message)).toContain('hybrid');
    });

    it('충전에 성공하면 웹 큐에서 그 엔트리가 빠진다', async () => {
        handle = startLogUploader();
        logger.info('TEST', 'moved');

        await handle.flush();

        // 웹 영속분에는 남지 않는다 — 소유권이 앱으로 넘어갔다.
        expect(stored.map(entry => entry.message)).not.toContain('moved');
    });

    it('충전이 실패하면 엔트리를 웹 큐에 남긴다', async () => {
        mockCharge.mockResolvedValueOnce(undefined as unknown as number);
        handle = startLogUploader();
        logger.info('TEST', 'stays');

        await handle.flush();

        expect(stored.map(entry => entry.message)).toContain('stays');
    });

    it('웹 큐가 충전 배치 크기에 차면 flush를 기다리지 않고 충전한다', async () => {
        handle = startLogUploader();

        for (let i = 0; i < 50; i += 1) logger.info('TEST', `entry-${i}`);
        await Promise.resolve();
        await Promise.resolve();

        expect(mockCharge).toHaveBeenCalled();
    });

    it('error는 즉시 충전한다 — 앱 큐에 없으면 앞당겨진 업로드가 그 error를 못 본다', async () => {
        handle = startLogUploader();

        logger.error('TEST', 'boom');
        await Promise.resolve();
        await Promise.resolve();

        expect(mockCharge).toHaveBeenCalledTimes(1);
        expect(appQueue.map(entry => entry.message)).toContain('boom');
    });

    it('error 폭주가 error마다 충전 왕복을 만들지 않는다', async () => {
        handle = startLogUploader();

        for (let i = 0; i < 5; i += 1) logger.error('TEST', `boom-${i}`);
        await Promise.resolve();
        await Promise.resolve();

        // 하한(5초) 안에서는 첫 건만 충전을 부른다.
        expect(mockCharge).toHaveBeenCalledTimes(1);
    });

    it('info는 즉시 충전을 부르지 않는다 — 주기와 크기에 맡긴다', async () => {
        handle = startLogUploader();

        logger.info('TEST', 'ordinary');
        await Promise.resolve();
        await Promise.resolve();

        expect(mockCharge).not.toHaveBeenCalled();
    });
});

describe('startLogUploader — 구버전 앱 폴백', () => {
    it('NOT_FOUND를 배운 뒤에는 충전하지 않고 웹 큐에서 보낸다 — 웹 로그가 멈추면 안 된다', async () => {
        mockIsNative = true;
        unsupported = true;
        handle = startLogUploader();
        logger.info('TEST', 'fallback');

        await handle.flush();

        expect(mockCharge).not.toHaveBeenCalled();
        expect(sentBatches()[0].map(entry => entry.message)).toContain('fallback');
    });

    it('세션 도중에 배워도 즉시 폴백한다 — 부팅 시점에 굳지 않는다', async () => {
        mockIsNative = true;
        handle = startLogUploader();
        logger.info('TEST', 'first');
        await handle.flush();
        expect(mockCharge).toHaveBeenCalledTimes(1);

        unsupported = true;
        logger.info('TEST', 'second');
        await handle.flush();

        expect(mockCharge).toHaveBeenCalledTimes(1);
        expect(
            sentBatches()
                .at(-1)
                ?.map(entry => entry.message)
        ).toContain('second');
    });
});

describe('startLogUploader — 기기 opt-out', () => {
    it('flush가 전송하지 않고 웹 큐를 비운다', async () => {
        handle = startLogUploader();
        logger.info('TEST', 'before opt-out');
        collectionEnabled = false;

        await handle.flush();

        expect(mockUpload).not.toHaveBeenCalled();
        expect(stored).toEqual([]);
    });

    it('하이브리드에서는 앱 큐 폐기까지 요청한다', async () => {
        mockIsNative = true;
        handle = startLogUploader();
        collectionEnabled = false;

        await handle.flush();

        expect(mockClearNative).toHaveBeenCalled();
    });

    it('부팅 시 이미 opt-out이면 복원된 큐를 들고 있지 않는다', async () => {
        stored = [{ id: 'old', level: 'info', tag: 'T', message: 'previous session', timestamp: 1 }];
        collectionEnabled = false;

        handle = startLogUploader();

        expect(stored).toEqual([]);
    });

    it('링버퍼는 건드리지 않는다 — 기기를 나가지 않고, 크래시 리포트를 읽게 해주는 것이다', async () => {
        handle = startLogUploader();
        logger.info('TEST', 'breadcrumb');
        collectionEnabled = false;

        await handle.flush();

        expect(logBuffer.peek().map(entry => entry.message)).toContain('breadcrumb');
    });
});
