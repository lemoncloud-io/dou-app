import { logBuffer, logger, setLogContextProvider } from '@chatic/logger';

import { markBatchRelayActive, resetBatchRelay } from './nativeForwarder';

import { setupBridgeLogger } from './setupBridgeLogger';

describe('setupBridgeLogger', () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    let teardown: (() => void) | undefined;

    beforeEach(() => {
        jest.clearAllMocks();
        logBuffer.clear();
        delete (window as any).ReactNativeWebView;
        delete (window as any).ChaticMessageHandler;
        delete (window as any).webkit;
    });

    afterEach(() => {
        // Detach sinks so the module-level singleton state never leaks
        // between cases.
        teardown?.();
        teardown = undefined;
    });

    afterAll(() => {
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    it('웹 환경에서는 콘솔 구독자를 배선하고, 폴백과 중복 출력하지 않는다', () => {
        teardown = setupBridgeLogger();

        logger.info('TEST', 'hello', { ok: true });

        expect(consoleLogSpy).toHaveBeenCalledTimes(1);
        expect(consoleLogSpy).toHaveBeenCalledWith('[TEST]', 'hello', { ok: true });
    });

    it('네이티브 환경에서는 직렬화된 로그를 브릿지로 전송한다', () => {
        const postMessage = jest.fn();
        (window as any).ReactNativeWebView = { postMessage };
        teardown = setupBridgeLogger();
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
        teardown = setupBridgeLogger();

        logger.info('TEST', 'native only');

        expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('consoleInNative 옵션이 켜지면 앱 전송과 콘솔 출력을 병행한다', () => {
        const postMessage = jest.fn();
        (window as any).ReactNativeWebView = { postMessage };
        teardown = setupBridgeLogger({ consoleInNative: true });

        logger.info('TEST', 'both sinks');

        expect(postMessage).toHaveBeenCalledTimes(1);
        expect(consoleLogSpy).toHaveBeenCalledWith('[TEST]', 'both sinks');
    });

    it('원본 발생 시각(timestamp)과 source:web을 페이로드에 보존한다', () => {
        const postMessage = jest.fn();
        (window as any).ReactNativeWebView = { postMessage };
        teardown = setupBridgeLogger();
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
        teardown = setupBridgeLogger();
        const error = new Error('legacy');

        logger.error('TEST', 'failed', error);

        const message = JSON.parse(postMessage.mock.calls[0][0]);
        expect(message.data.error).toMatchObject({
            name: 'Error',
            message: 'legacy',
        });
    });

    it('재호출은 기존 teardown을 반환하고 구독자를 중복 배선하지 않는다', () => {
        teardown = setupBridgeLogger();
        const second = setupBridgeLogger();

        logger.info('TEST', 'idempotent');

        expect(second).toBe(teardown);
        expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });

    it('teardown 이후에는 배선이 해제되고 콘솔 폴백으로 되돌아간다', () => {
        teardown = setupBridgeLogger();
        teardown();
        teardown = undefined;

        logger.info('TEST', 'after teardown');

        // Exactly once: via the built-in fallback, not a leftover subscriber.
        expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });
});

describe('createNativeForwarder — id와 발생 시점 컨텍스트 전달', () => {
    let teardown: (() => void) | undefined;

    const postAndRead = (emit: () => void): Record<string, unknown> => {
        const postMessage = jest.fn();
        (window as any).ReactNativeWebView = { postMessage };
        teardown = setupBridgeLogger();

        emit();

        return JSON.parse(postMessage.mock.calls[0][0]).data;
    };

    beforeEach(() => {
        logBuffer.clear();
        delete (window as any).ReactNativeWebView;
    });

    afterEach(() => {
        teardown?.();
        teardown = undefined;
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
    let teardown: (() => void) | undefined;
    let postMessage: jest.Mock;

    beforeEach(() => {
        logBuffer.clear();
        postMessage = jest.fn();
        (window as any).ReactNativeWebView = { postMessage };
        teardown = setupBridgeLogger();
    });

    afterEach(() => {
        teardown?.();
        teardown = undefined;
        delete (window as any).ReactNativeWebView;
    });

    it('debug는 브릿지로 보내지 않는다 — 업로드는 못 하면서 네이티브 링버퍼만 밀어낸다', () => {
        // `withNetworkLog` emits one of these per HTTP request. The upload queue
        // drops `debug`, so relaying it only evicts native-origin entries — which
        // have no second copy anywhere — from the 500-slot native buffer.
        logger.debug('NET', 'GET /messages');

        expect(postMessage).not.toHaveBeenCalled();
    });

    it('debug는 링버퍼에는 그대로 남는다 — 웹 로컬 브레드크럼은 잃지 않는다', () => {
        logger.debug('NET', 'GET /messages');

        expect(logBuffer.peek()).toEqual([expect.objectContaining({ level: 'debug', message: 'GET /messages' })]);
    });

    it('info/warn/error는 계속 릴레이한다', () => {
        logger.info('TEST', 'kept');
        logger.warn('TEST', 'kept');
        logger.error('TEST', 'kept');

        const levels = postMessage.mock.calls.map(([raw]) => JSON.parse(raw).data.level);
        expect(levels).toEqual(['info', 'warn', 'error']);
    });
});

describe('createNativeForwarder — 배치 충전이 인수하면 건당 릴레이를 멈춘다', () => {
    let teardown: (() => void) | undefined;
    let postMessage: jest.Mock;

    beforeEach(() => {
        logBuffer.clear();
        resetBatchRelay();
        postMessage = jest.fn();
        (window as any).ReactNativeWebView = { postMessage };
        teardown = setupBridgeLogger();
    });

    afterEach(() => {
        teardown?.();
        teardown = undefined;
        resetBatchRelay();
        delete (window as any).ReactNativeWebView;
    });

    it('충전이 인수하기 전에는 건당으로 보낸다 — 구버전 앱은 이 경로뿐이다', () => {
        logger.info('TEST', 'before');

        expect(postMessage).toHaveBeenCalledTimes(1);
    });

    it('인수한 뒤에는 보내지 않는다 — 두 경로가 같은 링버퍼에 이중 적재된다', () => {
        markBatchRelayActive();

        logger.info('TEST', 'after');
        logger.warn('TEST', 'after');
        logger.error('TEST', 'after');

        expect(postMessage).not.toHaveBeenCalled();
    });

    it('인수 여부와 무관하게 링버퍼에는 남는다 — 로컬 진단은 브리지와 상관없다', () => {
        markBatchRelayActive();

        logger.error('TEST', 'local');

        expect(logBuffer.peek().map(entry => entry.message)).toEqual(['local']);
    });
});
