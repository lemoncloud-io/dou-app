import { logHub } from '@chatic/logger';
import { LogService } from './LogService';

import type { LogEntry } from '@chatic/logger';

/**
 * The hub is the only way to observe an entry now: the ring buffer, its
 * persistence port and the `LogBufferService` facade over them are gone. A
 * subscriber installed before the action under test is therefore the assertion
 * surface — same pattern as `libs/logger/src/runtime.spec.ts`.
 */
const collect = () => {
    const entries: LogEntry[] = [];
    const unsubscribe = logHub.subscribe(entry => entries.push(entry));
    return { entries, unsubscribe };
};

describe('LogService (core-backed)', () => {
    it('발생 시각이 스탬프된 LogEntry로 코어 hub에 발행된다', () => {
        const service = new LogService();
        const { entries, unsubscribe } = collect();
        const before = Date.now();

        service.info('SMS', 'sent', { to: '010' });

        unsubscribe();
        const [entry] = entries;
        expect(entry).toMatchObject({ level: 'info', tag: 'SMS', message: 'sent', data: { to: '010' } });
        expect(entry.timestamp).toBeGreaterThanOrEqual(before);
    });

    it('구독자는 LogEntry 객체 하나를 받는다 (위치 인자 시그니처 제거)', () => {
        const service = new LogService();
        const listener = jest.fn();
        const unsubscribe = service.subscribe(listener);

        service.warn('STORAGE', 'slow');
        unsubscribe();
        service.warn('STORAGE', 'after');

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener.mock.calls[0][0]).toMatchObject({ level: 'warn', tag: 'STORAGE', message: 'slow' });
    });

    it('error는 raw error 인자와 options 형태 모두 entry.error로 실린다', () => {
        const service = new LogService();
        const raw = new Error('raw');
        const { entries, unsubscribe } = collect();

        service.error('APP', 'legacy', raw);
        service.error('APP', 'options', { error: raw, data: { key: 'v' } });

        unsubscribe();
        const [legacy, options] = entries;
        expect(legacy.error).toBe(raw);
        expect(options.error).toBe(raw);
        expect(options.data).toEqual({ key: 'v' });
    });
});
