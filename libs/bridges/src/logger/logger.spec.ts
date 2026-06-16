import { logger } from './logger';

describe('bridges logger', () => {
    const consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    beforeEach(() => {
        jest.clearAllMocks();
        delete (window as any).ReactNativeWebView;
        delete (window as any).ChaticMessageHandler;
        delete (window as any).webkit;
    });

    afterAll(() => {
        consoleDebugSpy.mockRestore();
        consoleLogSpy.mockRestore();
        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    it('uses console fallback outside native bridge environments', () => {
        logger.info('TEST', 'hello', { ok: true });

        expect(consoleLogSpy).toHaveBeenCalledWith('[TEST]', 'hello', { ok: true });
    });

    it('sends serialized log entries through the native bridge', () => {
        const postMessage = jest.fn();
        (window as any).ReactNativeWebView = { postMessage };
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

    it('accepts legacy raw error arguments', () => {
        const postMessage = jest.fn();
        (window as any).ReactNativeWebView = { postMessage };
        const error = new Error('legacy');

        logger.error('TEST', 'failed', error);

        const message = JSON.parse(postMessage.mock.calls[0][0]);
        expect(message.data.error).toMatchObject({
            name: 'Error',
            message: 'legacy',
        });
    });
});
