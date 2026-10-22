import { FirebasePerfTraceBackend } from './FirebasePerfTraceBackend';

import type { NativePerfTrace } from './FirebasePerfTraceBackend';
import type { PerfTraceResult } from '@chatic/perf';

// The SDK ships untransformed ESM and is replaced by the injected factory in every test anyway.
jest.mock('@react-native-firebase/perf', () => ({ getPerformance: jest.fn(), trace: jest.fn() }));

const createFakeTrace = () =>
    ({
        start: jest.fn().mockResolvedValue(null),
        stop: jest.fn().mockResolvedValue(null),
        putAttribute: jest.fn(),
        putMetric: jest.fn(),
    }) satisfies NativePerfTrace;

const resultFor = (id: string, extra: Partial<PerfTraceResult> = {}): PerfTraceResult => ({
    id,
    name: 'chat_room_open',
    durationMs: 0,
    attributes: {},
    metrics: {},
    ...extra,
});

const setup = () => {
    const traces: Array<{ name: string; trace: ReturnType<typeof createFakeTrace> }> = [];
    let now = 0;
    const backend = new FirebasePerfTraceBackend(
        name => {
            const trace = createFakeTrace();
            traces.push({ name, trace });
            return trace;
        },
        () => now
    );
    return { backend, traces, advance: (ms: number) => (now += ms) };
};

describe('FirebasePerfTraceBackend', () => {
    it('starts a Firebase trace under the trace name and stops it with its attributes and metrics', () => {
        const { backend, traces } = setup();

        backend.start({ id: 'a', name: 'chat_room_open' });
        backend.stop(resultFor('a', { attributes: { entry: 'push_tap' }, metrics: { mount: 420 } }));

        expect(traces).toHaveLength(1);
        const [{ name, trace }] = traces;
        expect(name).toBe('chat_room_open');
        expect(trace.start).toHaveBeenCalledTimes(1);
        expect(trace.putAttribute).toHaveBeenCalledWith('entry', 'push_tap');
        expect(trace.putMetric).toHaveBeenCalledWith('mount', 420);
        expect(trace.stop).toHaveBeenCalledTimes(1);
        expect(backend.openCount()).toBe(0);
    });

    it('ignores a stop for an id it does not hold', () => {
        const { backend, traces } = setup();

        backend.stop(resultFor('unknown'));

        expect(traces).toHaveLength(0);
    });

    it('keeps the running trace when the same id is started again', () => {
        const { backend, traces } = setup();

        backend.start({ id: 'a', name: 'boot' });
        backend.start({ id: 'a', name: 'boot' });

        expect(traces).toHaveLength(1);
    });

    it('drops a trace left open past the TTL without stopping it', () => {
        const { backend, traces, advance } = setup();

        backend.start({ id: 'stale', name: 'chat_room_open' });
        advance(FirebasePerfTraceBackend.OPEN_TTL_MS + 1);
        // Expiry is swept on the next start.
        backend.start({ id: 'fresh', name: 'chat_room_open' });
        backend.stop(resultFor('stale'));

        expect(traces[0].trace.stop).not.toHaveBeenCalled();
        expect(backend.openCount()).toBe(1);
    });

    it('swallows an SDK rejection so measurement cannot surface as an app error', async () => {
        const failing = createFakeTrace();
        failing.start.mockRejectedValue(new Error('perf disabled'));
        failing.stop.mockRejectedValue(new Error('perf disabled'));
        const backend = new FirebasePerfTraceBackend(() => failing);

        backend.start({ id: 'a', name: 'boot' });
        backend.stop(resultFor('a'));

        // An unhandled rejection would fail the test run; flushing lets one surface if it exists.
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(failing.stop).toHaveBeenCalledTimes(1);
    });

    it('refuses to record a trace stopped after its window, e.g. one that spanned the background', () => {
        const { backend, traces, advance } = setup();

        backend.start({ id: 'a', name: 'chat_room_open' });
        advance(FirebasePerfTraceBackend.OPEN_TTL_MS + 1);
        backend.stop(resultFor('a'));

        expect(traces[0].trace.stop).not.toHaveBeenCalled();
        expect(backend.openCount()).toBe(0);
    });

    it('still stops the trace when the SDK throws on a value, dropping only the values', () => {
        const { backend, traces } = setup();

        backend.start({ id: 'a', name: 'chat_room_open' });
        traces[0].trace.putAttribute.mockImplementation(() => {
            throw new Error('invalid attribute');
        });

        expect(() => backend.stop(resultFor('a', { attributes: { entry: 'list' } }))).not.toThrow();
        expect(traces[0].trace.stop).toHaveBeenCalledTimes(1);
    });

    it('sends Firebase only the attributes and metrics it has always received', () => {
        const { backend, traces } = setup();

        backend.start({ id: 'a', name: 'chat_room_open' });
        backend.stop(
            resultFor('a', { attributes: { entry: 'list', network: '4g' }, metrics: { mount: 5, new_phase: 1 } })
        );

        expect(traces[0].trace.putAttribute.mock.calls).toEqual([['entry', 'list']]);
        expect(traces[0].trace.putMetric.mock.calls).toEqual([['mount', 5]]);
    });

    it('never opens a Firebase trace for a pipeline-only name', () => {
        const { backend, traces } = setup();

        backend.start({ id: 'x', name: 'long_tasks' });

        expect(traces).toHaveLength(0);
    });

    it('leaves a web vital Firebase never had unstopped, so it is not recorded', () => {
        const { backend, traces } = setup();

        backend.start({ id: 'v', name: 'web_vitals' });
        backend.stop(resultFor('v', { name: 'web_vitals', attributes: { vital: 'inp' }, metrics: { value_ms: 80 } }));

        expect(traces[0].trace.stop).not.toHaveBeenCalled();
        expect(backend.openCount()).toBe(0);
    });

    it('records a trace name this build does not know, capped at five attributes as before', () => {
        const { backend, traces } = setup();

        backend.start({ id: 'n', name: 'future_trace' as never });
        backend.stop(
            resultFor('n', {
                name: 'future_trace' as never,
                attributes: { a: '1', b: '2', c: '3', d: '4', e: '5', f: '6' },
                metrics: { m: 1 },
            })
        );

        expect(traces[0].name).toBe('future_trace');
        expect(traces[0].trace.putAttribute.mock.calls.map(([key]) => key)).toEqual(['a', 'b', 'c', 'd', 'e']);
        expect(traces[0].trace.putMetric).toHaveBeenCalledWith('m', 1);
        expect(traces[0].trace.stop).toHaveBeenCalledTimes(1);
    });
});
