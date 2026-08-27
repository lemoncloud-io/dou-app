import { ingestLogEntry, logHub, readQueueDropTotal, resetQueueDropTotal } from '@chatic/logger';

import { LogUploadQueueService } from './LogUploadQueueService';

import type { LogEntry } from '@chatic/logger';
import type { LogUploadQueuePersistence } from './types';

/**
 * Its own file on purpose.
 *
 * The drop counter is process-wide and `logHub` is a module singleton, so a
 * suite that shares a file with services other tests left subscribed would see
 * every one of those queues drop the same entry and count it again. Jest gives
 * each file its own module registry, which is what makes the numbers here exact
 * rather than "greater than".
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
        resetQueueDropTotal();
        service = new LogUploadQueueService(persistence(), false);
        service.init();
    });

    afterEach(() => service.teardown());

    it('드롭이 없으면 0으로 남는다 — 그래야 지표에 dropped 키가 붙지 않는다', () => {
        publish(3, 'a');

        expect(readQueueDropTotal()).toBe(0);
        expect(service.getSize()).toBe(3);
    });

    it('상한(500건)을 넘긴 만큼 누적한다', () => {
        publish(520, 'b');

        expect(service.getSize()).toBe(500);
        expect(readQueueDropTotal()).toBe(20);
    });

    it('읽어도 소진되지 않는다 — 살아남은 마지막 지표가 총량을 말할 수 있어야 한다', () => {
        publish(520, 'c');

        expect(readQueueDropTotal()).toBe(20);
        expect(readQueueDropTotal()).toBe(20);
    });

    it('드롭 경로는 로그를 한 줄도 내지 않는다 — hub publish 안이라 재진입한다', () => {
        const seen: LogEntry[] = [];
        const unsubscribe = logHub.subscribe(published => seen.push(published));

        try {
            publish(520, 'd');

            expect(readQueueDropTotal()).toBe(20);
            // Exactly what was published: the drop callback added no entry of its own.
            expect(seen).toHaveLength(520);
            expect(seen.every(published => published.tag === 'SEED')).toBe(true);
        } finally {
            unsubscribe();
        }
    });
});
