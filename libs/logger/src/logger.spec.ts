import { logBuffer, logger, logHub } from './logger';

describe('logger facade', () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    beforeEach(() => {
        jest.clearAllMocks();
        // The facade is a module-level singleton; reset shared buffer state
        // so cases stay independent.
        logBuffer.clear();
    });

    afterAll(() => {
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    it('publish 시 timestamp를 찍어 구독자에게 전달한다', () => {
        const listener = jest.fn();
        const unsubscribe = logHub.subscribe(listener);
        const before = Date.now();

        logger.info('TEST', 'hello', { ok: true });

        unsubscribe();
        expect(listener).toHaveBeenCalledWith(
            expect.objectContaining({
                level: 'info',
                tag: 'TEST',
                message: 'hello',
                data: { ok: true },
                timestamp: expect.any(Number),
            })
        );
        expect(listener.mock.calls[0][0].timestamp).toBeGreaterThanOrEqual(before);
    });

    it('구독자가 없으면 콘솔 폴백으로 출력한다', () => {
        logger.info('TEST', 'fallback');

        expect(consoleLogSpy).toHaveBeenCalledWith('[TEST]', 'fallback');
    });

    it('구독자가 하나라도 있으면 콘솔 폴백은 동작하지 않는다', () => {
        const unsubscribe = logHub.subscribe(jest.fn());

        logger.info('TEST', 'wired');

        unsubscribe();
        expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('모든 로그는 구독 여부와 무관하게 내장 버퍼에 쌓인다', () => {
        logger.debug('TAG_A', 'first');
        logger.warn('TAG_B', 'second');

        expect(logBuffer.size()).toBe(2);
        expect(logBuffer.peek().map(entry => entry.message)).toEqual(['first', 'second']);
    });

    it('error는 options 객체와 raw error 인자를 모두 정규화한다', () => {
        const listener = jest.fn();
        const unsubscribe = logHub.subscribe(listener);
        const error = new Error('boom');

        logger.error('TEST', 'with options', { error, data: { id: 1 } });
        logger.error('TEST', 'raw error', error);

        unsubscribe();
        expect(listener).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ level: 'error', error, data: { id: 1 } })
        );
        expect(listener).toHaveBeenNthCalledWith(2, expect.objectContaining({ level: 'error', error }));
    });

    it('poll은 오래된 순으로 꺼내며 버퍼에서 제거하고, clear는 전체를 비운다', () => {
        logger.info('TEST', 'one');
        logger.info('TEST', 'two');
        logger.info('TEST', 'three');

        expect(logBuffer.poll(2).map(entry => entry.message)).toEqual(['one', 'two']);
        expect(logBuffer.size()).toBe(1);

        logBuffer.clear();
        expect(logBuffer.size()).toBe(0);
        expect(logBuffer.peek()).toEqual([]);
    });
});
