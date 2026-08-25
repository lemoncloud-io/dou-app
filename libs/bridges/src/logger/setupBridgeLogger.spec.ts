import { logHub, logger, setLogContextProvider } from '@chatic/logger';

import { setupBridgeLogger } from './setupBridgeLogger';

import type { BridgeLoggerHandle } from './setupBridgeLogger';
import type { LogEntry } from '@chatic/logger';

/**
 * The hub is the only way to observe an entry now, so the cases that used to
 * read the ring buffer install a subscriber instead. It must go in before the
 * action under test — the hub delivers only to whoever is subscribed at publish
 * time — and come out after, so the console-fallback cases in the first block
 * still see an unwired hub.
 */
const collect = () => {
    const entries: LogEntry[] = [];
    const unsubscribe = logHub.subscribe(entry => entries.push(entry));
    return { entries, unsubscribe };
};

describe('setupBridgeLogger', () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    let handle: BridgeLoggerHandle | undefined;

    beforeEach(() => {
        jest.clearAllMocks();
        delete (window as any).ReactNativeWebView;
        delete (window as any).ChaticMessageHandler;
        delete (window as any).webkit;
    });

    afterEach(() => {
        // Detach sinks so the module-level singleton state never leaks
        // between cases.
        handle?.teardown();
        handle = undefined;
    });

    afterAll(() => {
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    it('웹 환경에서는 아무것도 구독하지 않는다 — 콘솔은 apps/web 소관이다', () => {
        // 예전에는 여기서 콘솔을 붙였다. 브릿지에 관한 함수가 콘솔 출력까지
        // 결정하던 것이고, 웹 싱크가 브릿지 패키지에 살던 것이다. 지금은
        // apps/web의 attachConsoleListener가 그 결정을 갖는다.
        handle = setupBridgeLogger();

        logger.info('TEST', 'hello', { ok: true });

        expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('네이티브 환경에서는 직렬화된 로그를 브릿지로 전송한다', () => {
        const postMessage = jest.fn();
        (window as any).ReactNativeWebView = { postMessage };
        handle = setupBridgeLogger();
        const error = new Error('boom');
        const circular: Record<string, unknown> = {};
        circular.self = circular;

        logger.error('TEST', 'failed', { error, data: circular });

        expect(postMessage).toHaveBeenCalledTimes(1);
        const message = JSON.parse(postMessage.mock.calls[0][0]);
        expect(message).toMatchObject({
            type: 'SendLog',
            data: {
                level: 'error',
                tag: 'TEST',
                message: 'failed',
                data: '[object Object]',
                error: {
                    name: 'Error',
                    message: 'boom',
                },
            },
        });
        expect(message.data.error.stack).toEqual(expect.any(String));
    });

    it('네이티브 환경에서 기본값은 콘솔 미러링 없이 앱 전송만 한다', () => {
        (window as any).ReactNativeWebView = { postMessage: jest.fn() };
        handle = setupBridgeLogger();

        logger.info('TEST', 'native only');

        expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('원본 발생 시각(timestamp)과 source:web을 페이로드에 보존한다', () => {
        const postMessage = jest.fn();
        (window as any).ReactNativeWebView = { postMessage };
        handle = setupBridgeLogger();
        const before = Date.now();

        logger.info('SOCKET', 'forwarded');

        const message = JSON.parse(postMessage.mock.calls[0][0]);
        expect(message.data.source).toBe('web');
        expect(message.data.tag).toBe('SOCKET');
        expect(message.data.timestamp).toBeGreaterThanOrEqual(before);
        expect(message.data.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('legacy raw error 인자도 그대로 전송된다', () => {
        const postMessage = jest.fn();
        (window as any).ReactNativeWebView = { postMessage };
        handle = setupBridgeLogger();
        const error = new Error('legacy');

        logger.error('TEST', 'failed', error);

        const message = JSON.parse(postMessage.mock.calls[0][0]);
        expect(message.data.error).toMatchObject({
            name: 'Error',
            message: 'legacy',
        });
    });

    it('재호출은 기존 핸들을 반환하고 구독자를 중복 배선하지 않는다', () => {
        const postMessage = jest.fn();
        (window as any).ReactNativeWebView = { postMessage };
        handle = setupBridgeLogger();
        const second = setupBridgeLogger();

        logger.info('TEST', 'idempotent');

        expect(second).toBe(handle);
        expect(postMessage).toHaveBeenCalledTimes(1);
    });

    it('teardown 이후에는 배선이 해제되고 아무 데도 찍히지 않는다', () => {
        // 예전에는 여기서 코어의 콘솔 폴백이 되살아났다. 구독자 수에 따라 켜지는
        // 싱크는 pub/sub이 아니므로 폐지했고(원칙 16), teardown은 이제 정말로
        // 아무 구독자도 남기지 않는다.
        handle = setupBridgeLogger();
        handle.teardown();
        handle = undefined;

        logger.info('TEST', 'after teardown');

        expect(consoleLogSpy).not.toHaveBeenCalled();
    });
});

describe('createNativeForwarder — id와 발생 시점 컨텍스트 전달', () => {
    let handle: BridgeLoggerHandle | undefined;

    const postAndRead = (emit: () => void): Record<string, unknown> => {
        const postMessage = jest.fn();
        (window as any).ReactNativeWebView = { postMessage };
        handle = setupBridgeLogger();

        emit();

        return JSON.parse(postMessage.mock.calls[0][0]).data;
    };

    beforeEach(() => {
        delete (window as any).ReactNativeWebView;
    });

    afterEach(() => {
        handle?.teardown();
        handle = undefined;
        setLogContextProvider(undefined);
    });

    it('엔트리 id를 함께 보낸다 — 없으면 하이브리드에서 한 로그가 문서 두 건이 된다', () => {
        // The uploader queues this entry AND later drains it back out of the
        // native buffer; a shared id is what collapses the two into one
        // document server-side.
        const data = postAndRead(() => logger.info('TEST', 'hybrid entry'));

        expect(data.id).toEqual(expect.any(String));
    });

    it('발생 시점 컨텍스트를 그대로 실어 보낸다', () => {
        setLogContextProvider(() => ({ runId: 'run-9', uid: 'u-9', cid: 'c-9', route: '/home' }));

        const data = postAndRead(() => logger.warn('TEST', 'with context'));

        expect(data).toEqual(expect.objectContaining({ runId: 'run-9', uid: 'u-9', cid: 'c-9', route: '/home' }));
    });
});

describe('createNativeForwarder — debug 릴레이 차단', () => {
    let handle: BridgeLoggerHandle | undefined;
    let postMessage: jest.Mock;

    beforeEach(() => {
        postMessage = jest.fn();
        (window as any).ReactNativeWebView = { postMessage };
        handle = setupBridgeLogger();
    });

    afterEach(() => {
        handle?.teardown();
        handle = undefined;
        delete (window as any).ReactNativeWebView;
    });

    it('debug는 브릿지로 보내지 않는다 — 앱 큐가 어차피 버리는데 왕복 비용만 낸다', () => {
        // `withNetworkLog` emits one of these per HTTP request. The upload queue
        // drops `debug`, so relaying it only evicts native-origin entries — which
        // have no second copy anywhere — from the 500-slot native buffer.
        logger.debug('NET', 'GET /messages');

        expect(postMessage).not.toHaveBeenCalled();
    });

    it('debug는 hub에는 그대로 발행된다 — 웹 로컬 브레드크럼은 잃지 않는다', () => {
        // The gate lives inside the forwarder, not in dispatch: `debug` still
        // reaches every hub subscriber (console, upload queue, debug view), it
        // just does not cross the bridge.
        const { entries, unsubscribe } = collect();

        logger.debug('NET', 'GET /messages');

        unsubscribe();
        expect(entries).toEqual([expect.objectContaining({ level: 'debug', message: 'GET /messages' })]);
    });

    it('info/warn/error는 계속 릴레이한다', () => {
        logger.info('TEST', 'kept');
        logger.warn('TEST', 'kept');
        logger.error('TEST', 'kept');

        const levels = postMessage.mock.calls.map(([raw]) => JSON.parse(raw).data.level);
        expect(levels).toEqual(['info', 'warn', 'error']);
    });
});

describe('createNativeForwarder — 하이브리드의 유일한 웹→앱 경로', () => {
    let handle: BridgeLoggerHandle | undefined;
    let postMessage: jest.Mock;

    beforeEach(() => {
        postMessage = jest.fn();
        (window as any).ReactNativeWebView = { postMessage };
        handle = setupBridgeLogger();
    });

    afterEach(() => {
        handle?.teardown();
        handle = undefined;
        delete (window as any).ReactNativeWebView;
    });

    it('엔트리 하나가 메시지 하나다 — 묶지 않는다', () => {
        // 배치로 묶으려면 이 리스너가 버퍼와 타이머와 트리거 규칙을 품어야 하고,
        // 그러면 나머지 두 리스너와 성질이 달라진다(원칙 17).
        logger.info('TEST', 'one');
        logger.warn('TEST', 'two');
        logger.error('TEST', 'three');

        expect(postMessage).toHaveBeenCalledTimes(3);
    });

    it('상태를 갖지 않는다 — 멈추거나 인수되는 경로가 없다', () => {
        // 예전에는 배치 충전이 인수하면 조용해지는 게이트가 있었다. 경로가
        // 둘이었기 때문이고, 지금은 하나라 전환할 대상이 없다.
        logger.info('TEST', 'a');
        logger.info('TEST', 'b');

        expect(postMessage).toHaveBeenCalledTimes(2);
        expect(handle).not.toHaveProperty('standDownNativeRelay');
    });

    it('브리지로 보내는 것과 무관하게 hub에도 발행된다 — 로컬 진단은 별개다', () => {
        const { entries, unsubscribe } = collect();

        logger.error('TEST', 'local');

        unsubscribe();
        expect(entries.map(entry => entry.message)).toEqual(['local']);
        expect(postMessage).toHaveBeenCalledTimes(1);
    });
});

describe('createNativeForwarder — 폭주 제어', () => {
    let handle: BridgeLoggerHandle | undefined;
    let postMessage: jest.Mock;

    /** 브리지로 실제로 나간 메시지들. */
    const sent = () => postMessage.mock.calls.map(call => JSON.parse(call[0]).data.message as string);

    beforeEach(() => {
        postMessage = jest.fn();
        (window as any).ReactNativeWebView = { postMessage };
        handle = setupBridgeLogger();
    });

    afterEach(() => {
        handle?.teardown();
        handle = undefined;
        delete (window as any).ReactNativeWebView;
        jest.restoreAllMocks();
    });

    it('같은 줄이 창 안에서 반복되면 임계 이후를 접는다', () => {
        // 네트워크가 멎으면 타임아웃마다 같은 error가 난다. n번째 사본은 첫 번째가
        // 말하지 않은 것을 말하지 않는데, 하필 브리지가 경합 자원이 된 순간에
        // postMessage 하나를 쓴다.
        for (let i = 0; i < 50; i += 1) logger.error('NET', 'GET /messages failed');

        expect(postMessage).toHaveBeenCalledTimes(5);
    });

    it('다른 줄은 서로를 막지 않는다', () => {
        for (let i = 0; i < 50; i += 1) logger.error('NET', 'GET /messages failed');
        logger.error('NET', 'POST /chats failed');
        logger.warn('SOCKET', 'reconnecting');

        expect(sent()).toContain('POST /chats failed');
        expect(sent()).toContain('reconnecting');
    });

    it('접힌 건수는 다음 발생 때 함께 보고된다 — 조용히 사라지지 않는다', () => {
        jest.spyOn(Date, 'now').mockReturnValue(1_000);
        for (let i = 0; i < 20; i += 1) logger.error('NET', 'GET /messages failed');

        // 창이 지난 뒤의 첫 발생
        (Date.now as jest.Mock).mockReturnValue(1_000 + 1_500);
        logger.error('NET', 'GET /messages failed');

        expect(sent().some(m => m.includes('+15 identical suppressed'))).toBe(true);
    });

    it('창이 지나면 다시 통과시킨다 — 영구 차단이 아니다', () => {
        jest.spyOn(Date, 'now').mockReturnValue(1_000);
        for (let i = 0; i < 50; i += 1) logger.error('NET', 'GET /messages failed');
        const during = postMessage.mock.calls.length;

        (Date.now as jest.Mock).mockReturnValue(1_000 + 2_000);
        logger.error('NET', 'GET /messages failed');

        expect(postMessage.mock.calls.length).toBeGreaterThan(during);
    });

    it('띄엄띄엄 나는 같은 줄은 접히지 않는다 — 평시에는 아무 일도 하지 않는다', () => {
        let clock = 1_000;
        jest.spyOn(Date, 'now').mockImplementation(() => clock);

        for (let i = 0; i < 10; i += 1) {
            logger.info('APP', 'heartbeat');
            clock += 1_100;
        }

        expect(postMessage).toHaveBeenCalledTimes(10);
    });
});

describe('createNativeForwarder — debug는 앱이 찍을 수 있을 때만 건넌다', () => {
    let handle: BridgeLoggerHandle | undefined;
    let postMessage: jest.Mock;

    beforeEach(() => {
        postMessage = jest.fn();
        (window as any).ReactNativeWebView = { postMessage };
    });

    afterEach(() => {
        handle?.teardown();
        handle = undefined;
        delete (window as any).ReactNativeWebView;
        delete (globalThis as any).CHATIC_APP_CONSOLE_ENABLED;
    });

    it('릴리스 앱(플래그 false)에서는 보내지 않는다', () => {
        (globalThis as any).CHATIC_APP_CONSOLE_ENABLED = false;
        handle = setupBridgeLogger();

        logger.debug('NET', 'GET /messages');

        expect(postMessage).not.toHaveBeenCalled();
    });

    it('콘솔이 살아있는 앱에서는 보낸다 — 앱 터미널이 웹·네이티브 통합 타임라인이다', () => {
        (globalThis as any).CHATIC_APP_CONSOLE_ENABLED = true;
        handle = setupBridgeLogger();

        logger.debug('NET', 'GET /messages');

        expect(postMessage).toHaveBeenCalledTimes(1);
    });

    it('플래그를 주지 않는 구버전 앱에서는 보내지 않는다 — 기존 동작 그대로', () => {
        handle = setupBridgeLogger();

        logger.debug('NET', 'GET /messages');

        expect(postMessage).not.toHaveBeenCalled();
    });

    it('debug를 보내는 빌드에서도 반복 접기는 그대로 적용된다', () => {
        (globalThis as any).CHATIC_APP_CONSOLE_ENABLED = true;
        handle = setupBridgeLogger();

        for (let i = 0; i < 50; i += 1) logger.debug('NET', 'GET /messages');

        expect(postMessage).toHaveBeenCalledTimes(5);
    });
});
