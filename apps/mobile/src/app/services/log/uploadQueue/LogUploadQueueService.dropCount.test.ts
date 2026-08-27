import { ingestLogEntry, logHub } from '@chatic/logger';

import { LogUploadQueueService } from './LogUploadQueueService';

import type { LogEntry } from '@chatic/logger';
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

describe('LogUploadQueueService — 백프레셔 드롭 카운트 (ADR-0071)', () => {
    let service: LogUploadQueueService;

    beforeEach(() => {
        service = new LogUploadQueueService(persistence(), false);
        service.init();
    });

    afterEach(() => service.teardown());

    it('드롭이 없으면 0이다', () => {
        publish(3, 'a');

        expect(service.getSize()).toBe(3);
        expect(service.getDroppedCount()).toBe(0);
    });

    it('상한(500건)을 넘긴 만큼 센다', () => {
        publish(520, 'b');

        expect(service.getSize()).toBe(500);
        expect(service.getDroppedCount()).toBe(20);
    });

    it('ack로 큐를 비워도 총계는 남는다 — 런 전체의 유실률이라서', () => {
        publish(520, 'c');
        service.ack(service.fetch().map(queued => queued.id as string));

        expect(service.getSize()).toBe(0);
        expect(service.getDroppedCount()).toBe(20);
    });

    it('세는 경로는 로그를 한 줄도 내지 않는다 — hub publish 안이라 재진입한다', () => {
        const seen: LogEntry[] = [];
        const unsubscribe = logHub.subscribe(published => seen.push(published));

        try {
            publish(520, 'd');

            expect(service.getDroppedCount()).toBe(20);
            // Exactly what was published: counting added no entry of its own.
            expect(seen).toHaveLength(520);
            expect(seen.every(published => published.tag === 'SEED')).toBe(true);
        } finally {
            unsubscribe();
        }
    });
});
