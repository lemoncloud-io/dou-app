import { ingestLogEntry, logBuffer, logger } from '../runtime';
import { attachLogPersistence } from './attachLogPersistence';
import { DEFAULT_ERROR_FLUSH_MIN_INTERVAL_MS, DEFAULT_PERSIST_DEBOUNCE_MS } from './LogPersistence';
import type { LogPersistence } from './LogPersistence';
import type { LogEntry } from '../core/types';

const entry = (overrides: Partial<LogEntry> = {}): LogEntry => ({
    level: 'info',
    tag: 'TEST',
    message: 'msg',
    timestamp: 1_000,
    ...overrides,
});

const createFakePersistence = (initial: LogEntry[] = []): LogPersistence & { saves: LogEntry[][] } => {
    const saves: LogEntry[][] = [];
    return {
        saves,
        load: () => initial,
        save: entries => {
            saves.push(entries);
        },
    };
};

describe('logBuffer.load / ingestLogEntry', () => {
    afterEach(() => {
        logBuffer.clear();
    });

    it('load는 복원 항목을 부팅 중 쌓인 항목보다 앞에 배치한다', () => {
        logger.info('BOOT', 'early');
        logBuffer.load([entry({ message: 'restored' })]);

        const messages = logBuffer.peek().map(e => e.message);
        expect(messages).toEqual(['restored', 'early']);
    });

    it('ingestLogEntry는 timestamp를 재스탬프하지 않고 그대로 적재한다', () => {
        ingestLogEntry(entry({ timestamp: 42, tag: 'SOCKET', source: 'web' }));

        const [stored] = logBuffer.peek();
        expect(stored.timestamp).toBe(42);
        expect(stored.tag).toBe('SOCKET');
        expect(stored.source).toBe('web');
    });
});

describe('attachLogPersistence', () => {
    let teardown: (() => void) | undefined;

    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        teardown?.();
        teardown = undefined;
        logBuffer.clear();
        jest.useRealTimers();
    });

    it('restore 옵션이 켜지면 attach 시점에 저장분을 버퍼로 복원한다', () => {
        const persistence = createFakePersistence([entry({ message: 'persisted' })]);

        teardown = attachLogPersistence(persistence, { restore: true });

        expect(logBuffer.peek().map(e => e.message)).toEqual(['persisted']);
    });

    it('일반 로그는 디바운스 윈도우가 지난 뒤 한 번만 저장한다', () => {
        const persistence = createFakePersistence();
        teardown = attachLogPersistence(persistence);

        logger.info('TEST', 'one');
        logger.info('TEST', 'two');
        expect(persistence.saves).toHaveLength(0);

        jest.advanceTimersByTime(DEFAULT_PERSIST_DEBOUNCE_MS);

        expect(persistence.saves).toHaveLength(1);
        expect(persistence.saves[0].map(e => e.message)).toEqual(['one', 'two']);
    });

    it('error 레벨은 디바운스를 건너뛰고 즉시 저장한다', () => {
        const persistence = createFakePersistence();
        teardown = attachLogPersistence(persistence);

        logger.error('TEST', 'boom', new Error('x'));

        expect(persistence.saves).toHaveLength(1);
        expect(persistence.saves[0].map(e => e.message)).toEqual(['boom']);
    });

    it('error 즉시 저장은 최소 간격으로 rate-limit되고, 밀린 항목은 디바운스로 저장된다', () => {
        const persistence = createFakePersistence();
        teardown = attachLogPersistence(persistence);

        logger.error('TEST', 'first');
        logger.error('TEST', 'second'); // within min interval → debounced instead

        expect(persistence.saves).toHaveLength(1);

        jest.advanceTimersByTime(DEFAULT_ERROR_FLUSH_MIN_INTERVAL_MS);
        logger.error('TEST', 'third'); // past min interval → immediate again

        expect(persistence.saves).toHaveLength(2);
        expect(persistence.saves[1].map(e => e.message)).toEqual(['first', 'second', 'third']);
    });

    it('teardown은 대기 중인 저장을 flush하고 이후 저장을 멈춘다', () => {
        const persistence = createFakePersistence();
        teardown = attachLogPersistence(persistence);

        logger.info('TEST', 'pending');
        teardown();
        teardown = undefined;

        expect(persistence.saves).toHaveLength(1);
        expect(persistence.saves[0].map(e => e.message)).toEqual(['pending']);

        logger.info('TEST', 'after');
        jest.advanceTimersByTime(DEFAULT_PERSIST_DEBOUNCE_MS);
        expect(persistence.saves).toHaveLength(1);
    });

    it('load가 던져도 attach는 실패하지 않는다 (오염된 저장소 방어)', () => {
        const persistence: LogPersistence = {
            load: () => {
                throw new Error('corrupt');
            },
            save: () => undefined,
        };

        expect(() => {
            teardown = attachLogPersistence(persistence, { restore: true });
        }).not.toThrow();
    });

    it('save가 던져도 로깅 파이프라인은 계속 동작한다', () => {
        const persistence: LogPersistence = {
            load: () => [],
            save: () => {
                throw new Error('quota');
            },
        };
        teardown = attachLogPersistence(persistence);

        expect(() => logger.error('TEST', 'boom')).not.toThrow();
        expect(logBuffer.peek().map(e => e.message)).toEqual(['boom']);
    });
});
