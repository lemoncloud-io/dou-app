import { logger } from '@chatic/bridges';

import { getLogQueueView } from './logQueueView';
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
let uploadHeld = false;
jest.mock('./logUploadSwitch', () => ({
    isLogCollectionEnabled: () => collectionEnabled,
    createLogUploadSwitch: () => () => collectionEnabled && !uploadHeld,
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
jest.mock('./nativeUploadSource', () => ({
    isNativeUploadQueueUnsupported: () => unsupported,
    chargeNativeLogQueue: (entries: LogEntry[]) => mockCharge(entries),
    clearNativeLogQueue: () => mockClearNative(),
    createNativeUploadSource: () => ({
        peek: async (limit: number) => appQueue.slice(0, limit),
        ack: async (entries: LogEntry[]) => {
            appQueue = appQueue.filter(item => !entries.includes(item));
        },
        clear: async () => {
            appQueue = [];
        },
        size: () => appQueue.length,
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
    uploadHeld = false;
    unsupported = false;
    stored = [];
    appQueue = [];
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

    it('앱이 답하면 부팅 창 사본을 버린다 — 저장의 주인은 앱이다', async () => {
        // 낱건 릴레이가 dispatch 시점에 엔트리를 앱으로 넘겼으므로, 앱이 저장소를
        // 서빙한다고 확인된 순간 웹의 사본은 중복이다. 그전까지만 들고 있는다.
        handle = startLogUploader();
        logger.info('TEST', 'hybrid');

        await handle.flush();

        expect(stored).toEqual([]);
    });

    it('앱 저장소에서 꺼내 전송한다', async () => {
        appQueue.push({ id: 'from-app', level: 'info', tag: 'APP', message: 'native-origin', timestamp: 1 });
        handle = startLogUploader();

        await handle.flush();

        expect(sentBatches()[0].map(e => e.message)).toContain('native-origin');
    });

    it('전송에 성공하면 앱 저장소에서 빠진다', async () => {
        appQueue.push({ id: 'acked', level: 'info', tag: 'APP', message: 'gone', timestamp: 1 });
        handle = startLogUploader();

        await handle.flush();

        expect(appQueue).toHaveLength(0);
    });

    it('앱 저장소가 비어 있으면 서버를 부르지 않는다', async () => {
        handle = startLogUploader();

        await handle.flush();

        expect(mockUpload).not.toHaveBeenCalled();
    });
});

describe('startLogUploader — 앱이 저장소를 못 줄 때 (구버전 앱)', () => {
    beforeEach(() => {
        mockIsNative = true;
        unsupported = true;
    });

    it('웹이 대신 쌓고 직접 보낸다 — 앱보다 먼저 배포되는 쪽이 웹이다', async () => {
        // 이 경로의 메시지(FetchLogUploadQueue 등)는 앱과 함께 배포되는데 웹이
        // 먼저 나간다. 폴백이 없으면 앱이 따라잡을 때까지 모든 하이브리드
        // 사용자의 로그가 서버에 닿지 않는다 — 엣지 케이스가 아니라 기본 상태다.
        handle = startLogUploader();
        logger.info('TEST', 'kept by web');

        await handle.flush();

        expect(sentBatches()[0].map(e => e.message)).toContain('kept by web');
    });

    it('부팅 창의 엔트리도 살아남는다 — NOT_FOUND는 첫 사이클에야 배운다', async () => {
        // 하이브리드라고 처음부터 적재를 끄면, 앱이 답하기 전에 나온 엔트리는
        // 어디에도 없다. 하필 그 구간이 세션의 나머지를 설명하는 부분이다.
        handle = startLogUploader();
        logger.info('TEST', 'boot window');

        await handle.flush();

        expect(stored.map(e => e.message)).not.toContain('boot window');
        expect(sentBatches()[0].map(e => e.message)).toContain('boot window');
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

    // 이 자리에는 "링버퍼는 건드리지 않는다"가 있었다. 저장소가 둘일 때는 opt-out이
    // 전송용만 비우고 진단용은 남기는 것이 맞았지만, 이제 저장소가 하나라 그 구분이
    // 없다 — opt-out은 남는 사본이 없어야 한다는 더 센 성질로 대체된다.
    it('적재분이 어디에도 남지 않는다 — 저장소가 하나이므로 예외가 없다', async () => {
        handle = startLogUploader();
        logger.info('TEST', 'collected');
        collectionEnabled = false;

        await handle.flush();

        expect(stored).toEqual([]);
        expect(getLogQueueView()?.snapshot()).toEqual([]);
    });
});

/**
 * The monitor reads the queue through a registered view rather than holding it,
 * so the uploader stays its only writer. What matters is that the view is live —
 * a stale copy would show a debugging session logs that already shipped.
 */
describe('startLogUploader — 큐 뷰 등록', () => {
    it('실행 중에는 큐를 비파괴로 읽을 수 있다', () => {
        handle = startLogUploader();
        logger.info('TEST', 'visible');

        expect(
            getLogQueueView()
                ?.snapshot()
                .map(entry => entry.message)
        ).toContain('visible');
        // Reading must not consume — the uploader still has to ship it.
        expect(
            getLogQueueView()
                ?.snapshot()
                .map(entry => entry.message)
        ).toContain('visible');
    });

    it('debug는 뷰에도 없다 — 큐에 애초에 들어가지 않는다', () => {
        handle = startLogUploader();
        logger.debug('TEST', 'noisy');
        logger.info('TEST', 'kept');

        const messages =
            getLogQueueView()
                ?.snapshot()
                .map(entry => entry.message) ?? [];
        expect(messages).toContain('kept');
        expect(messages).not.toContain('noisy');
    });

    it('전송되면 뷰에서도 사라진다 — 뷰가 큐 자신이라는 뜻이다', async () => {
        handle = startLogUploader();
        logger.info('TEST', 'shipped');

        await handle.flush();

        expect(getLogQueueView()?.snapshot()).toEqual([]);
    });

    it('버리기는 큐를 비우고 디스크 사본까지 맞춘다', () => {
        handle = startLogUploader();
        logger.info('TEST', 'discarded');

        getLogQueueView()?.clear();

        expect(getLogQueueView()?.snapshot()).toEqual([]);
        expect(stored).toEqual([]);
    });

    it('teardown 후에는 뷰가 사라진다', () => {
        handle = startLogUploader();
        handle.teardown();
        handle = undefined;

        expect(getLogQueueView()).toBeUndefined();
    });
});

/**
 * The hold toggle is the lever that turns the queue into a monitoring view, so
 * what has to hold is the *pair* of properties: nothing is sent, and nothing is
 * lost. A hold that also drained would show an empty screen; a hold that stopped
 * collecting would show one too, for a different reason.
 */
describe('startLogUploader — 전송 보류', () => {
    it('전송하지 않지만 큐는 유지된다 — 비워지면 모니터링할 것이 없다', async () => {
        handle = startLogUploader();
        logger.info('TEST', 'held');
        uploadHeld = true;

        await handle.flush();

        expect(mockUpload).not.toHaveBeenCalled();
        expect(stored.map(entry => entry.message)).toContain('held');
    });

    it('보류 중에도 수집은 계속된다 — 보류를 풀면 그 사이 로그가 나가야 한다', async () => {
        uploadHeld = true;
        handle = startLogUploader();
        logger.info('TEST', 'during hold');

        await handle.flush();
        expect(mockUpload).not.toHaveBeenCalled();

        uploadHeld = false;
        await handle.flush();

        expect(sentBatches()[0].map(entry => entry.message)).toContain('during hold');
    });

    it('하이브리드에서 보류를 켜면 앱 저장소가 유지된다 — 모니터링이 읽는 곳이 거기다', async () => {
        // 보류는 "쌓아두되 보내지 마라"이므로 ack이 일어나지 않아야 한다.
        // 적재 자체는 릴레이가 계속 하므로 이 레버와 무관하다(원칙 14).
        mockIsNative = true;
        uploadHeld = true;
        appQueue.push({ id: 'held', level: 'info', tag: 'APP', message: 'still here', timestamp: 1 });
        handle = startLogUploader();

        await handle.flush();

        expect(mockUpload).not.toHaveBeenCalled();
        expect(appQueue.map(entry => entry.message)).toContain('still here');
    });

    it('opt-out과 동시에 켜지면 opt-out이 이긴다 — 큐를 버리는 쪽이 더 센 레버다', async () => {
        handle = startLogUploader();
        logger.info('TEST', 'discarded');
        uploadHeld = true;
        collectionEnabled = false;

        await handle.flush();

        expect(mockUpload).not.toHaveBeenCalled();
        expect(stored).toEqual([]);
    });
});
