import { ingestLogEntry, logBuffer, logger, logHub, setLogContextProvider } from './logger';

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

describe('엔트리 id와 발생 시점 컨텍스트', () => {
    beforeEach(() => {
        logBuffer.clear();
        setLogContextProvider(undefined);
    });

    afterEach(() => {
        setLogContextProvider(undefined);
    });

    it('dispatch가 엔트리마다 서로 다른 id를 붙인다 — 서버 dedup 키다', () => {
        logger.info('TEST', 'first');
        logger.info('TEST', 'second');

        const [first, second] = logBuffer.peek();
        expect(first.id).toEqual(expect.any(String));
        expect(second.id).toEqual(expect.any(String));
        expect(first.id).not.toBe(second.id);
    });

    it('등록된 프로바이더의 컨텍스트를 발생 시점 값으로 엔트리에 싣는다', () => {
        setLogContextProvider(() => ({ runId: 'run-1', uid: 'u-1', cid: 'c-1', route: '/home' }));

        logger.warn('TEST', 'with context');

        expect(logBuffer.peek()[0]).toEqual(
            expect.objectContaining({ runId: 'run-1', uid: 'u-1', cid: 'c-1', route: '/home' })
        );
    });

    it('컨텍스트가 바뀌면 이후 엔트리만 새 값을 갖고 이전 엔트리는 옛 값을 유지한다', () => {
        // The whole point of capturing at dispatch: a queue drained later must
        // not relabel entries with whatever the session looks like by then.
        setLogContextProvider(() => ({ uid: 'guest', cid: 'default' }));
        logger.info('TEST', 'before login');

        setLogContextProvider(() => ({ uid: 'user-9', cid: 'cloud-9' }));
        logger.info('TEST', 'after login');

        const [before, after] = logBuffer.peek();
        expect(before).toEqual(expect.objectContaining({ uid: 'guest', cid: 'default' }));
        expect(after).toEqual(expect.objectContaining({ uid: 'user-9', cid: 'cloud-9' }));
    });

    it('프로바이더가 없으면 컨텍스트 없이 정상 동작한다', () => {
        logger.info('TEST', 'no provider');

        const entry = logBuffer.peek()[0];
        expect(entry.message).toBe('no provider');
        expect(entry.runId).toBeUndefined();
    });

    it('프로바이더가 던져도 로깅이 죽지 않는다', () => {
        setLogContextProvider(() => {
            throw new Error('session not ready');
        });

        expect(() => logger.error('TEST', 'provider throws')).not.toThrow();
        expect(logBuffer.peek()[0]).toEqual(expect.objectContaining({ message: 'provider throws' }));
    });

    it('ingestLogEntry는 건너온 엔트리의 id·timestamp·컨텍스트를 보존한다', () => {
        ingestLogEntry({
            id: 'native-id-1',
            level: 'info',
            tag: 'NATIVE',
            message: 'from app',
            timestamp: 111,
            source: 'native',
            runId: 'run-native',
            uid: 'u-native',
        });

        expect(logBuffer.peek()[0]).toEqual(
            expect.objectContaining({
                id: 'native-id-1',
                timestamp: 111,
                runId: 'run-native',
                uid: 'u-native',
            })
        );
    });

    it('id 없이 건너온 엔트리에는 id를 채우되 timestamp·컨텍스트는 덮지 않는다', () => {
        // An older app relays entries without an id; without a backfill a
        // resend would store a second document.
        setLogContextProvider(() => ({ uid: 'current-web-user' }));

        ingestLogEntry({
            level: 'info',
            tag: 'NATIVE',
            message: 'legacy relay',
            timestamp: 222,
            source: 'native',
            uid: 'u-old',
        });

        const entry = logBuffer.peek()[0];
        expect(entry.id).toEqual(expect.any(String));
        expect(entry.timestamp).toBe(222);
        expect(entry.uid).toBe('u-old');
    });
});
