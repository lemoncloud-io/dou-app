import { createConsoleListener } from './consoleListener';
import type { LogEntry } from './types';

describe('createConsoleListener', () => {
    const consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    const listener = createConsoleListener();

    const entryOf = (partial: Partial<LogEntry>): LogEntry => ({
        level: 'info',
        tag: 'TEST',
        message: 'message',
        timestamp: 1,
        ...partial,
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterAll(() => {
        consoleDebugSpy.mockRestore();
        consoleLogSpy.mockRestore();
        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    it('레벨별로 대응하는 콘솔 메서드를 호출한다', () => {
        listener(entryOf({ level: 'debug' }));
        listener(entryOf({ level: 'info' }));
        listener(entryOf({ level: 'warn' }));
        listener(entryOf({ level: 'error' }));

        expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
        expect(consoleLogSpy).toHaveBeenCalledTimes(1);
        expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
        expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('data가 있으면 태그·메시지와 함께 출력한다', () => {
        listener(entryOf({ message: 'hello', data: { ok: true } }));

        expect(consoleLogSpy).toHaveBeenCalledWith('[TEST]', 'hello', { ok: true });
    });

    it('data가 없으면 태그와 메시지만 출력한다', () => {
        listener(entryOf({ message: 'hello' }));

        expect(consoleLogSpy).toHaveBeenCalledWith('[TEST]', 'hello');
    });

    it('error 레벨에서 error 값이 있으면 error와 data를 함께 출력한다', () => {
        const error = new Error('boom');
        listener(entryOf({ level: 'error', message: 'failed', error }));

        expect(consoleErrorSpy).toHaveBeenCalledWith('[TEST]', 'failed', error, '');
    });
});
