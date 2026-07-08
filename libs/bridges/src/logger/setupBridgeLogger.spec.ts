import { logBuffer, logger } from '@chatic/logger';

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
