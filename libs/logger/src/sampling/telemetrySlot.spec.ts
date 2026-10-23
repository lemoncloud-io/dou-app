import { recordTelemetry, setTelemetryRecorder } from './telemetrySlot';

afterEach(() => setTelemetryRecorder(undefined));

describe('telemetry slot', () => {
    it('does nothing until a recorder is set', () => {
        expect(() => recordTelemetry('sample', 'api_request')).not.toThrow();
    });

    it('records through the recorder that is set', () => {
        const record = jest.fn();
        setTelemetryRecorder({ record });
        recordTelemetry('sample', 'api_request', { metrics: { rtt_ms: 3 } });

        expect(record).toHaveBeenCalledWith('sample', 'api_request', { metrics: { rtt_ms: 3 } });
    });

    it('swallows a recorder that throws', () => {
        setTelemetryRecorder({
            record: () => {
                throw new Error('boom');
            },
        });
        expect(() => recordTelemetry('event', 'x')).not.toThrow();
    });
});
