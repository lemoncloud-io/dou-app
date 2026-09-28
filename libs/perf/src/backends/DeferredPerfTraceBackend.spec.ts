import { DeferredPerfTraceBackend } from './DeferredPerfTraceBackend';

import type { PerfTraceBackend } from '../PerfTrace';
import type { PerfTraceResult } from '../types';

const createBackend = () => ({ start: jest.fn(), stop: jest.fn() }) satisfies PerfTraceBackend;

const resultFor = (id: string): PerfTraceResult => ({
    id,
    name: 'web_vitals',
    durationMs: 0,
    attributes: {},
    metrics: {},
});

describe('DeferredPerfTraceBackend', () => {
    it('holds calls until resolved, then replays them in order', () => {
        const deferred = new DeferredPerfTraceBackend();
        const target = createBackend();
        const order: string[] = [];
        target.start.mockImplementation(({ id }) => order.push(`start:${id}`));
        target.stop.mockImplementation(({ id }) => order.push(`stop:${id}`));

        deferred.start({ id: 'a', name: 'web_vitals' });
        deferred.stop(resultFor('a'));
        deferred.start({ id: 'b', name: 'web_vitals' });
        expect(order).toEqual([]);

        deferred.resolve(target);

        expect(order).toEqual(['start:a', 'stop:a', 'start:b']);
    });

    it('forwards directly once resolved', () => {
        const deferred = new DeferredPerfTraceBackend();
        const target = createBackend();
        deferred.resolve(target);

        deferred.stop(resultFor('a'));

        expect(target.stop).toHaveBeenCalledWith(resultFor('a'));
    });

    it('keeps the first destination when resolved twice', () => {
        const deferred = new DeferredPerfTraceBackend();
        const first = createBackend();
        const second = createBackend();
        deferred.resolve(first);
        deferred.resolve(second);

        deferred.start({ id: 'a', name: 'boot' });

        expect(first.start).toHaveBeenCalledTimes(1);
        expect(second.start).not.toHaveBeenCalled();
    });

    it('drops what arrives past the cap instead of evicting what it already holds', () => {
        const deferred = new DeferredPerfTraceBackend();
        for (let i = 0; i < DeferredPerfTraceBackend.MAX_PENDING + 5; i += 1) {
            deferred.start({ id: `t${i}`, name: 'web_vitals' });
        }
        const target = createBackend();
        deferred.resolve(target);

        expect(target.start).toHaveBeenCalledTimes(DeferredPerfTraceBackend.MAX_PENDING);
        expect(target.start.mock.calls[0][0].id).toBe('t0');
    });
});
