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
        // Previously the console only turned on when there were 0 subscribers. A sink whose
        // output appears and disappears based on subscriber count isn't pub/sub — it would make
        // "detach one listener" also decide whether the console prints (principle 16). The
        // console subscribes too.
        logger.info('TEST', 'nowhere');

        expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    // Back when there was a ring buffer, "it accumulates regardless of subscription" was a
    // structural guarantee. Now an entry that fires before anything subscribes survives nowhere
    // — that's why principle 15 pins the wiring order down as an invariant.
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

/**
 * The third argument used to mean different things per level: `error` unwrapped `{ error, data }`,
 * the other three stored it whole. 42 call sites wrote the options shape at `warn`/`info`/`debug`
 * anyway, so every one of them buried its fields at `data.data` and left `entry.error` empty —
 * including the `observation` discriminator that ADR-0099 exists to make readable.
 */
describe('세 번째 인자는 레벨과 무관하게 같은 뜻이다', () => {
    it.each(['debug', 'info', 'warn', 'error'] as const)('%s가 { error, data }를 풀어 담는다', level => {
        const { entries, unsubscribe } = collect();
        const boom = new Error('boom');

        logger[level]('SOCKET', 'failed', { error: boom, data: { observation: 'sync-streak', streak: 3 } });
        unsubscribe();

        expect(entries).toHaveLength(1);
        expect(entries[0].error).toBe(boom);
        expect(entries[0].data).toEqual({ observation: 'sync-streak', streak: 3 });
    });

    it.each(['debug', 'info', 'warn'] as const)('%s에 넘긴 평범한 객체는 data로 남는다', level => {
        const { entries, unsubscribe } = collect();

        logger[level]('SOCKET', 'reconnected', { kind: 'relay', connectCount: 2 });
        unsubscribe();

        expect(entries[0].data).toEqual({ kind: 'relay', connectCount: 2 });
        expect(entries[0].error).toBeUndefined();
    });

    // Only error keeps a different signature — the shorthand of passing an exception straight through has been used for a long time.
    it('error에 예외를 바로 넘기면 error 필드로 간다', () => {
        const { entries, unsubscribe } = collect();
        const boom = new Error('boom');

        logger.error('SOCKET', 'failed', boom);
        unsubscribe();

        expect(entries[0].error).toBe(boom);
        expect(entries[0].data).toBeUndefined();
    });
});
