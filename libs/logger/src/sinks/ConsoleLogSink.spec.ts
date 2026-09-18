import { ConsoleLogSink, createConsoleListener } from './ConsoleLogSink';
import type { LogEntry } from '../core/types';

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

describe('ConsoleLogSink — timestamps 옵션', () => {
    let logSpy: jest.SpyInstance;

    beforeEach(() => {
        logSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => jest.restoreAllMocks());

    it('기본은 시각을 붙이지 않는다 — 브라우저 콘솔이 도착 시각을 이미 찍는다', () => {
        new ConsoleLogSink().handle({ level: 'info', tag: 'TEST', message: 'plain', timestamp: 0 });

        expect(logSpy).toHaveBeenCalledWith('[TEST]', 'plain');
    });

    it('켜면 발생 시각을 앞에 붙인다 — 도착 시각이 아니다', () => {
        // The app terminal receives relayed web entries late. Reading them in arrival order
        // would distort the merged timeline, defeating the whole point of merging them.
        const at = new Date(2026, 0, 2, 3, 4, 5).getTime();

        new ConsoleLogSink({ timestamps: true }).handle({
            level: 'info',
            tag: 'TEST',
            message: 'stamped',
            timestamp: at,
        });

        const prefix = logSpy.mock.calls[0][0] as string;
        expect(prefix).toContain('[TEST]');
        expect(prefix).toContain(new Date(at).toLocaleTimeString());
    });
});
