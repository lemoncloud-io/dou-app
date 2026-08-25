import { ingestLogEntry, logger, logHub, setLogContextProvider } from './runtime';

import type { LogEntry } from './core/types';

/**
 * The hub is the only way to observe an entry now.
 *
 * These cases used to assert against the ring buffer, which captured everything
 * regardless of subscribers. That store is gone: what a log entry *is* is now
 * defined entirely by what the hub publishes, so a subscriber is the assertion
 * surface. Cases that need the zero-subscriber path (the console fallback)
 * deliberately do not install one.
 */
const collect = () => {
    const entries: LogEntry[] = [];
    const unsubscribe = logHub.subscribe(entry => entries.push(entry));
    return { entries, unsubscribe };
};

describe('logger facade', () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    beforeEach(() => {
        jest.clearAllMocks();
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

    it('구독자가 없으면 아무 데도 찍히지 않는다 — 콘솔 폴백은 없다', () => {
        // 예전에는 구독자 0일 때만 콘솔이 켜졌다. 구독자 수에 따라 출력이
        // 나타났다 사라지는 싱크는 pub/sub이 아니고, "리스너를 하나 뗀다"가
        // 콘솔 출력에 대한 결정까지 되어버린다(원칙 16). 콘솔도 구독한다.
        logger.info('TEST', 'nowhere');

        expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    // 링버퍼가 있던 시절에는 "구독 여부와 무관하게 쌓인다"가 구성상 보장이었다.
    // 이제는 구독보다 먼저 나온 엔트리가 어디에도 남지 않는다 — 그것이 원칙 15가
    // 배선 순서를 불변식으로 못 박은 이유다.
    it('구독 전에 나온 엔트리는 이후 구독자에게 배달되지 않는다', () => {
        logger.info('TEST', 'before subscribe');

        const { entries, unsubscribe } = collect();
        logger.info('TEST', 'after subscribe');
        unsubscribe();

        expect(entries.map(entry => entry.message)).toEqual(['after subscribe']);
    });

    it('모든 레벨이 같은 hub로 나간다', () => {
        const { entries, unsubscribe } = collect();

        logger.debug('TAG_A', 'first');
        logger.warn('TAG_B', 'second');

        unsubscribe();
        expect(entries.map(entry => entry.message)).toEqual(['first', 'second']);
        expect(entries.map(entry => entry.level)).toEqual(['debug', 'warn']);
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
});

describe('엔트리 id와 발생 시점 컨텍스트', () => {
    beforeEach(() => {
        setLogContextProvider(undefined);
    });

    afterEach(() => {
        setLogContextProvider(undefined);
    });

    it('dispatch가 엔트리마다 서로 다른 id를 붙인다 — 서버 dedup 키다', () => {
        const { entries, unsubscribe } = collect();

        logger.info('TEST', 'first');
        logger.info('TEST', 'second');

        unsubscribe();
        const [first, second] = entries;
        expect(first.id).toEqual(expect.any(String));
        expect(second.id).toEqual(expect.any(String));
        expect(first.id).not.toBe(second.id);
    });

    it('등록된 프로바이더의 컨텍스트를 발생 시점 값으로 엔트리에 싣는다', () => {
        setLogContextProvider(() => ({ runId: 'run-1', uid: 'u-1', cid: 'c-1', route: '/home' }));
        const { entries, unsubscribe } = collect();

        logger.warn('TEST', 'with context');

        unsubscribe();
        expect(entries[0]).toEqual(expect.objectContaining({ runId: 'run-1', uid: 'u-1', cid: 'c-1', route: '/home' }));
    });

    it('컨텍스트가 바뀌면 이후 엔트리만 새 값을 갖고 이전 엔트리는 옛 값을 유지한다', () => {
        // The whole point of capturing at dispatch: a queue drained later must
        // not relabel entries with whatever the session looks like by then.
        const { entries, unsubscribe } = collect();

        setLogContextProvider(() => ({ uid: 'guest', cid: 'default' }));
        logger.info('TEST', 'before login');

        setLogContextProvider(() => ({ uid: 'user-9', cid: 'cloud-9' }));
        logger.info('TEST', 'after login');

        unsubscribe();
        const [before, after] = entries;
        expect(before).toEqual(expect.objectContaining({ uid: 'guest', cid: 'default' }));
        expect(after).toEqual(expect.objectContaining({ uid: 'user-9', cid: 'cloud-9' }));
    });

    it('프로바이더가 없으면 컨텍스트 없이 정상 동작한다', () => {
        const { entries, unsubscribe } = collect();

        logger.info('TEST', 'no provider');

        unsubscribe();
        expect(entries[0].message).toBe('no provider');
        expect(entries[0].runId).toBeUndefined();
    });

    it('프로바이더가 던져도 로깅이 죽지 않는다', () => {
        setLogContextProvider(() => {
            throw new Error('session not ready');
        });
        const { entries, unsubscribe } = collect();

        expect(() => logger.error('TEST', 'provider throws')).not.toThrow();

        unsubscribe();
        expect(entries[0]).toEqual(expect.objectContaining({ message: 'provider throws' }));
    });

    it('ingestLogEntry는 건너온 엔트리의 id·timestamp·컨텍스트를 보존한다', () => {
        const { entries, unsubscribe } = collect();

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

        unsubscribe();
        expect(entries[0]).toEqual(
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
        const { entries, unsubscribe } = collect();

        ingestLogEntry({
            level: 'info',
            tag: 'NATIVE',
            message: 'legacy relay',
            timestamp: 222,
            source: 'native',
            uid: 'u-old',
        });

        unsubscribe();
        const entry = entries[0];
        expect(entry.id).toEqual(expect.any(String));
        expect(entry.timestamp).toBe(222);
        expect(entry.uid).toBe('u-old');
    });
});
