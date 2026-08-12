import { logBuffer, logger } from '@chatic/bridges';
import { attachWebLogPersistence, SessionStorageLogPersistence } from './webLogPersistence';

const QUEUE_KEY = '@chatic/web.log.queue';
const ALIVE_KEY = '@chatic/web.log.alive';

describe('SessionStorageLogPersistence', () => {
    beforeEach(() => {
        sessionStorage.clear();
    });

    it('순환 참조 data를 평탄화해 저장하고, round-trip으로 복원한다', () => {
        const persistence = new SessionStorageLogPersistence();
        const circular: Record<string, unknown> = {};
        circular.self = circular;

        persistence.save([{ level: 'info', tag: 'SOCKET', message: 'm', timestamp: 3, source: 'web', data: circular }]);

        const [entry] = persistence.load();
        expect(entry).toMatchObject({ level: 'info', tag: 'SOCKET', message: 'm', timestamp: 3, source: 'web' });
        expect(typeof entry.data).toBe('string');
        expect(entry.data).toContain('[Circular]');
    });

    it('오염된 저장소(JSON 아님/배열 아님)는 빈 배열로 처리한다', () => {
        const persistence = new SessionStorageLogPersistence();

        sessionStorage.setItem(QUEUE_KEY, '{broken');
        expect(persistence.load()).toEqual([]);

        sessionStorage.setItem(QUEUE_KEY, JSON.stringify({ nope: 1 }));
        expect(persistence.load()).toEqual([]);
    });

    it('과대 페이로드는 필드·총량 상한으로 잘려 저장된다 (sessionStorage 쿼터 방어)', () => {
        const persistence = new SessionStorageLogPersistence();
        const huge = 'x'.repeat(50_000);
        const entries = Array.from({ length: 30 }, (_, i) => ({
            level: 'info' as const,
            tag: 'APP',
            message: `m-${i}`,
            timestamp: i,
            data: { blob: huge },
        }));

        persistence.save(entries);

        const raw = sessionStorage.getItem(QUEUE_KEY) ?? '';
        // 30 × 50KB = 1.5MB짜리 입력이 공용 예산(40k chars) 안으로 들어와야 한다.
        expect(raw.length).toBeLessThan(60_000);
        // 예산 초과 시 가장 오래된 항목부터 버려 최신 로그를 남긴다.
        expect(persistence.load().at(-1)?.message).toBe('m-29');
    });

    it('필드가 빠진 레코드를 LogEntry로 정규화한다', () => {
        sessionStorage.setItem(QUEUE_KEY, JSON.stringify([{ message: 'legacy' }]));

        expect(new SessionStorageLogPersistence().load()).toEqual([
            { level: 'info', tag: 'APP', message: 'legacy', timestamp: 0 },
        ]);
    });
});

describe('attachWebLogPersistence', () => {
    let teardown: (() => void) | undefined;

    beforeEach(() => {
        jest.useFakeTimers();
        sessionStorage.clear();
    });

    afterEach(() => {
        teardown?.();
        teardown = undefined;
        logBuffer.clear();
        jest.useRealTimers();
    });

    it('첫 부팅은 크래시 아님으로 판정하고 alive 센티널을 세운다', () => {
        const result = attachWebLogPersistence();
        teardown = result.teardown;

        expect(result.crashedLastSession).toBe(false);
        expect(result.previousEntries).toEqual([]);
        expect(sessionStorage.getItem(ALIVE_KEY)).toBe('1');
    });

    it('pagehide(정상 종료)가 센티널을 지워 다음 부팅이 크래시로 오판하지 않는다', () => {
        const result = attachWebLogPersistence();
        teardown = result.teardown;

        window.dispatchEvent(new Event('pagehide'));

        expect(sessionStorage.getItem(ALIVE_KEY)).toBeNull();
    });

    it('센티널이 남은 채 재부팅하면 크래시로 판정하고 직전 세션 버퍼를 돌려준다', () => {
        // First session: logs an entry (persisted via error immediate flush) and
        // dies without pagehide.
        const first = attachWebLogPersistence();
        logger.error('APP', 'about to die');
        first.teardown();
        // teardown removes the pagehide listener but we simulate a crash: put
        // the sentinel back as if the session never exited cleanly.
        sessionStorage.setItem(ALIVE_KEY, '1');
        logBuffer.clear();

        const second = attachWebLogPersistence();
        teardown = second.teardown;

        expect(second.crashedLastSession).toBe(true);
        expect(second.previousEntries.map(e => e.message)).toEqual(['about to die']);
        // The previous session's entries are NOT restored into the live buffer.
        expect(logBuffer.size()).toBe(0);
    });

    it('현재 세션의 로그는 디바운스 후 sessionStorage에 영속된다', () => {
        const result = attachWebLogPersistence();
        teardown = result.teardown;

        logger.info('APP', 'persisted');
        jest.advanceTimersByTime(1_000);

        const saved = JSON.parse(sessionStorage.getItem(QUEUE_KEY) ?? '[]');
        expect(saved.map((e: { message: string }) => e.message)).toEqual(['persisted']);
    });
});
