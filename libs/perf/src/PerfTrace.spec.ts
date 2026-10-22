import { MAX_PERF_ATTRIBUTES } from './limits';
import { createPerfTrace } from './PerfTrace';

import type { PerfTraceBackend } from './PerfTrace';

const createBackend = () => ({ start: jest.fn(), stop: jest.fn() }) satisfies PerfTraceBackend;

const createTrace = (backend: PerfTraceBackend, announce = true) => {
    let elapsed = 0;
    const trace = createPerfTrace({
        backend,
        id: 't-1',
        name: 'chat_room_open',
        elapsed: () => elapsed,
        announce,
        now: () => 1_000,
    });
    return { trace, advance: (ms: number) => (elapsed += ms) };
};

describe('createPerfTrace', () => {
    it('announces the start to the backend only when asked to', () => {
        const announced = createBackend();
        createTrace(announced, true);
        expect(announced.start).toHaveBeenCalledWith({ id: 't-1', name: 'chat_room_open' });

        const adopted = createBackend();
        createTrace(adopted, false);
        expect(adopted.start).not.toHaveBeenCalled();
    });

    it('delivers duration, attributes and metrics on stop', () => {
        const backend = createBackend();
        const { trace, advance } = createTrace(backend);

        trace.putAttribute('entry', 'list');
        trace.putMetric('message_count', 12.4);
        advance(250.6);
        trace.stop();

        expect(backend.stop).toHaveBeenCalledWith({
            id: 't-1',
            name: 'chat_room_open',
            durationMs: 251,
            attributes: { entry: 'list' },
            metrics: { message_count: 12 },
            endedAt: 1_000,
        });
    });

    it('marks a sample on the stop, and only a sample', () => {
        const backend = createBackend();
        createPerfTrace({
            backend,
            id: 's',
            name: 'web_vitals',
            elapsed: () => 0,
            announce: true,
            sample: true,
        }).stop();
        createTrace(backend).trace.stop();

        expect(backend.stop.mock.calls[0][0]).toMatchObject({ sample: true });
        expect(backend.stop.mock.calls[1][0]).not.toHaveProperty('sample');
    });

    it('keeps 32 metrics and drops a new one past that, while still overwriting existing ones', () => {
        const backend = createBackend();
        const { trace } = createTrace(backend);
        for (let i = 0; i < 32; i += 1) trace.putMetric(`m${i}`, i);
        trace.putMetric('extra', 1);
        trace.putMetric('m0', 99);
        trace.stop();

        const { metrics } = backend.stop.mock.calls[0][0];
        expect(Object.keys(metrics)).toHaveLength(32);
        expect(metrics.extra).toBeUndefined();
        expect(metrics.m0).toBe(99);
    });

    it('keeps the first mark for a key, since the boundary was reached the first time', () => {
        const backend = createBackend();
        const { trace, advance } = createTrace(backend);

        advance(100);
        trace.mark('mount');
        advance(400);
        trace.mark('mount');
        trace.stop();

        expect(backend.stop.mock.calls[0][0].metrics).toEqual({ mount: 100 });
    });

    it('lets a later putMetric overwrite an earlier one', () => {
        const backend = createBackend();
        const { trace } = createTrace(backend);

        trace.putMetric('count', 1);
        trace.putMetric('count', 2);
        trace.stop();

        expect(backend.stop.mock.calls[0][0].metrics).toEqual({ count: 2 });
    });

    it('stops once, and ignores every call after that', () => {
        const backend = createBackend();
        const { trace } = createTrace(backend);

        trace.stop();
        trace.putAttribute('outcome', 'late');
        trace.putMetric('late', 1);
        trace.mark('late_mark');
        trace.stop();

        expect(backend.stop).toHaveBeenCalledTimes(1);
        expect(backend.stop.mock.calls[0][0]).toMatchObject({ attributes: {}, metrics: {} });
    });

    it('drops a new attribute past the cap but still lets an existing one change', () => {
        const backend = createBackend();
        const { trace } = createTrace(backend);

        for (let i = 0; i < MAX_PERF_ATTRIBUTES; i += 1) trace.putAttribute(`a${i}`, 'x');
        trace.putAttribute('extra', 'x');
        trace.putAttribute('a0', 'changed');
        trace.stop();

        const { attributes } = backend.stop.mock.calls[0][0];
        expect(Object.keys(attributes)).toHaveLength(MAX_PERF_ATTRIBUTES);
        expect(attributes).not.toHaveProperty('extra');
        expect(attributes.a0).toBe('changed');
    });

    it('rejects keys and values Firebase would reject, and truncates an over-long value', () => {
        const backend = createBackend();
        const { trace } = createTrace(backend);

        trace.putAttribute('_leading', 'x');
        trace.putAttribute('firebase_reserved', 'x');
        trace.putAttribute('has-dash', 'x');
        trace.putAttribute('empty', '   ');
        trace.putAttribute('long', 'y'.repeat(150));
        trace.putMetric('nan', Number.NaN);
        trace.putMetric('9starts_with_digit', 1);
        trace.stop();

        const { attributes, metrics } = backend.stop.mock.calls[0][0];
        expect(attributes).toEqual({ long: 'y'.repeat(100) });
        expect(metrics).toEqual({});
    });

    it('never reports a negative duration from a clock that went backwards', () => {
        const backend = createBackend();
        const { trace, advance } = createTrace(backend);

        advance(-50);
        trace.stop();

        expect(backend.stop.mock.calls[0][0].durationMs).toBe(0);
    });

    it('reports whether a metric has been recorded, so another module can wait on a phase', () => {
        const backend = createBackend();
        const { trace } = createTrace(backend);

        expect(trace.hasMetric('feed_done')).toBe(false);
        trace.mark('feed_done');
        expect(trace.hasMetric('feed_done')).toBe(true);
        trace.putMetric('latest_no', 41);
        expect(trace.getMetric('latest_no')).toBe(41);
        expect(trace.getMetric('missing')).toBeUndefined();
    });
});
