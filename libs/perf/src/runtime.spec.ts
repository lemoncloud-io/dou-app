import { adoptPerfTrace, configurePerfTraces, recordPerfSample, resetPerfTraces, startPerfTrace } from './runtime';

import type { PerfTraceBackend } from './PerfTrace';

const createBackend = () => ({ start: jest.fn(), stop: jest.fn() }) satisfies PerfTraceBackend;

describe('perf runtime', () => {
    afterEach(() => {
        resetPerfTraces();
        jest.useRealTimers();
    });

    it('records nothing before a backend is configured', () => {
        const backend = createBackend();
        const trace = startPerfTrace('boot');
        configurePerfTraces(backend);
        trace.stop();

        expect(backend.start).not.toHaveBeenCalled();
        expect(backend.stop).not.toHaveBeenCalled();
    });

    it('keeps a trace on the backend it started on when the slot is swapped mid-flight', () => {
        const first = createBackend();
        const second = createBackend();
        configurePerfTraces(first);

        const trace = startPerfTrace('site_switch');
        configurePerfTraces(second);
        trace.stop();

        expect(first.start).toHaveBeenCalledTimes(1);
        expect(first.stop).toHaveBeenCalledTimes(1);
        expect(second.start).not.toHaveBeenCalled();
        expect(second.stop).not.toHaveBeenCalled();
    });

    it('gives each started trace its own id', () => {
        configurePerfTraces(createBackend());
        expect(startPerfTrace('boot').id).not.toBe(startPerfTrace('boot').id);
    });

    it('measures an adopted trace from the original start, not from the hand-over', () => {
        jest.useFakeTimers({ now: 10_000 });
        const backend = createBackend();
        configurePerfTraces(backend);

        // Started natively 1.5s before the WebView took it over.
        const trace = adoptPerfTrace('chat_room_open', 'native-1', 8_500);
        jest.setSystemTime(10_200);
        trace.mark('mount');
        trace.stop();

        expect(backend.start).not.toHaveBeenCalled();
        expect(backend.stop).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'native-1', durationMs: 1_700, metrics: { mount: 1_700 } })
        );
    });

    it('records a sample as a start and an immediate stop carrying its values', () => {
        const backend = createBackend();
        configurePerfTraces(backend);

        recordPerfSample('web_vitals', { attributes: { vital: 'lcp' }, metrics: { value_ms: 2_345 } });

        expect(backend.start).toHaveBeenCalledTimes(1);
        expect(backend.stop).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'web_vitals', attributes: { vital: 'lcp' }, metrics: { value_ms: 2_345 } })
        );
    });
});
