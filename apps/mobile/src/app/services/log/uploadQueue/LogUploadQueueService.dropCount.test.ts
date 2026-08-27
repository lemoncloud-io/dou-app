import { configurePerfMetrics, ingestLogEntry, logHub, reportPerfMetric, resetPerfMetrics } from '@chatic/logger';

import { LogUploadQueueService } from './LogUploadQueueService';

import type { LogEntry, Logger } from '@chatic/logger';
import type { LogUploadQueuePersistence } from './types';

/**
 * Its own file on purpose.
 *
 * `logHub` is a module singleton, so a suite that shares a file with services
 * other tests left subscribed would see every one of those queues drop the same
 * entry and count it again. Jest gives each file its own module registry, which
 * is what makes the numbers here exact rather than "greater than".
 */

const persistence = (): LogUploadQueuePersistence => {
    let stored: LogEntry[] = [];
    let lastLogAt: number | undefined;
    return {
        load: () => stored,
        save: (entries: LogEntry[]) => {
            stored = entries;
        },
        loadLastLogAt: () => lastLogAt,
        saveLastLogAt: (timestamp: number) => {
            lastLogAt = timestamp;
        },
    };
};

const entry = (id: string): LogEntry => ({ id, level: 'info', tag: 'SEED', message: 'msg', timestamp: 1 });

const publish = (count: number, prefix: string) => {
    for (let i = 0; i < count; i += 1) ingestLogEntry(entry(`${prefix}-${i}`));
};

/**
 * The drop total is not readable on its own — it exists to ride out on the next
 * metric, so that is what these assert. The mock logger keeps those metric
 * entries off the hub, so reporting cannot feed the queue it is measuring.
 */
const perfLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

const reportedDrops = (): number | undefined => {
    reportPerfMetric('boot', 1000);
    const data = perfLogger.info.mock.calls.at(-1)?.[2] as { dropped?: number } | undefined;
    return data?.dropped;
};

describe('LogUploadQueueService — 백프레셔 드롭 카운트 (ADR-0071)', () => {
    let service: LogUploadQueueService;

    beforeEach(() => {
        jest.clearAllMocks();
        // Before the service: the reporter owns the count, so it has to exist
        // before the queue that feeds it — the same ordering the hosts keep.
        configurePerfMetrics({ logger: perfLogger as Logger, runId: 'run-1', samplePercent: 100 });
        service = new LogUploadQueueService(persistence(), false);
        service.init();
    });

    afterEach(() => {
        service.teardown();
        resetPerfMetrics();
    });

    it('드롭이 없으면 dropped 키가 붙지 않는다', () => {
        publish(3, 'a');

        expect(service.getSize()).toBe(3);
        expect(reportedDrops()).toBeUndefined();
    });

    it('상한(500건)을 넘긴 만큼 다음 지표에 실린다', () => {
        publish(520, 'b');

        expect(service.getSize()).toBe(500);
        expect(reportedDrops()).toBe(20);
    });

    it('읽어도 소진되지 않는다 — 살아남은 마지막 지표가 총량을 말할 수 있어야 한다', () => {
        publish(520, 'c');

        expect(reportedDrops()).toBe(20);
        expect(reportedDrops()).toBe(20);
    });

    it('드롭 경로는 로그를 한 줄도 내지 않는다 — hub publish 안이라 재진입한다', () => {
        const seen: LogEntry[] = [];
        const unsubscribe = logHub.subscribe(published => seen.push(published));

        try {
            publish(520, 'd');

            expect(reportedDrops()).toBe(20);
            // Exactly what was published: the drop callback added no entry of its own.
            expect(seen).toHaveLength(520);
            expect(seen.every(published => published.tag === 'SEED')).toBe(true);
        } finally {
            unsubscribe();
        }
    });
});
