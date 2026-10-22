import { FanOutPerfTraceBackend } from './FanOutPerfTraceBackend';
import { FirebaseDimensionsPerfTraceBackend } from './FirebaseDimensionsPerfTraceBackend';
import { PipelinePerfTraceBackend } from './PipelinePerfTraceBackend';

import type { PerfTraceBackend } from '../PerfTrace';
import type { PerfTraceResult } from '../types';

const backend = () => ({ start: jest.fn(), stop: jest.fn() }) satisfies PerfTraceBackend;
const result = (overrides: Partial<PerfTraceResult> = {}): PerfTraceResult => ({
    id: 't1',
    name: 'chat_room_open',
    durationMs: 42,
    attributes: { entry: 'list', network: '4g' },
    metrics: { mount: 5 },
    endedAt: 1_700,
    ...overrides,
});

describe('FanOutPerfTraceBackend', () => {
    it('hands every start and stop to every branch', () => {
        const a = backend();
        const b = backend();
        const fan = new FanOutPerfTraceBackend([a, b]);

        fan.start({ id: 't1', name: 'boot' });
        fan.stop(result());

        for (const branch of [a, b]) {
            expect(branch.start).toHaveBeenCalledWith({ id: 't1', name: 'boot' });
            expect(branch.stop).toHaveBeenCalledWith(result());
        }
    });

    it('keeps recording on the other branches when one throws', () => {
        const broken = {
            start: jest.fn(() => {
                throw new Error('sdk');
            }),
            stop: jest.fn(() => {
                throw new Error('sdk');
            }),
        };
        const ok = backend();
        const fan = new FanOutPerfTraceBackend([broken, ok]);

        expect(() => fan.start({ id: 't1', name: 'boot' })).not.toThrow();
        expect(() => fan.stop(result())).not.toThrow();
        expect(ok.start).toHaveBeenCalled();
        expect(ok.stop).toHaveBeenCalled();
    });

    it('gives each branch its own copy, so one cannot change what the next records', () => {
        const mutating = {
            start: jest.fn(),
            stop: jest.fn((r: PerfTraceResult) => {
                delete r.attributes.entry;
            }),
        };
        const after = backend();
        new FanOutPerfTraceBackend([mutating, after]).stop(result());

        expect(after.stop.mock.calls[0][0].attributes).toEqual({ entry: 'list', network: '4g' });
    });
});

describe('FirebaseDimensionsPerfTraceBackend', () => {
    it('passes a known trace through with only its Firebase attributes and metrics', () => {
        const inner = backend();
        const firebase = new FirebaseDimensionsPerfTraceBackend(inner);

        firebase.start({ id: 't1', name: 'chat_room_open' });
        firebase.stop(result());

        expect(inner.start).toHaveBeenCalledWith({ id: 't1', name: 'chat_room_open' });
        expect(inner.stop).toHaveBeenCalledWith({
            id: 't1',
            name: 'chat_room_open',
            durationMs: 42,
            attributes: { entry: 'list' },
            metrics: { mount: 5 },
        });
    });

    it('never starts or stops a pipeline-only trace', () => {
        const inner = backend();
        const firebase = new FirebaseDimensionsPerfTraceBackend(inner);

        firebase.start({ id: 'x', name: 'long_tasks' });
        firebase.stop(result({ id: 'x', name: 'long_tasks', attributes: { screen: '/' }, metrics: { count: 1 } }));

        expect(inner.start).not.toHaveBeenCalled();
        expect(inner.stop).not.toHaveBeenCalled();
    });

    it('holds a web_vitals start until the stop says which vital it is', () => {
        const inner = backend();
        const firebase = new FirebaseDimensionsPerfTraceBackend(inner);

        firebase.start({ id: 'lcp', name: 'web_vitals' });
        expect(inner.start).not.toHaveBeenCalled();
        firebase.stop(
            result({ id: 'lcp', name: 'web_vitals', attributes: { vital: 'lcp' }, metrics: { value_ms: 900 } })
        );
        expect(inner.start).toHaveBeenCalledWith({ id: 'lcp', name: 'web_vitals' });
        expect(inner.stop).toHaveBeenCalledTimes(1);

        firebase.start({ id: 'inp', name: 'web_vitals' });
        firebase.stop(
            result({ id: 'inp', name: 'web_vitals', attributes: { vital: 'inp' }, metrics: { value_ms: 80 } })
        );
        expect(inner.start).toHaveBeenCalledTimes(1);
        expect(inner.stop).toHaveBeenCalledTimes(1);
    });
});

describe('PipelinePerfTraceBackend', () => {
    it('records nothing while there is no recorder', () => {
        expect(() => new PipelinePerfTraceBackend(() => undefined).stop(result())).not.toThrow();
    });

    it('records a trace with its duration, structured fields and the stop time', () => {
        const record = jest.fn();
        new PipelinePerfTraceBackend(() => ({ record })).stop(result());

        expect(record).toHaveBeenCalledWith('trace', 'chat_room_open', {
            durationMs: 42,
            attrs: { entry: 'list', network: '4g' },
            metrics: { mount: 5 },
            timestamp: 1_700,
        });
    });

    it('records a sample without a duration', () => {
        const record = jest.fn();
        new PipelinePerfTraceBackend(() => ({ record })).stop(result({ name: 'web_vitals', sample: true }));

        expect(record.mock.calls[0][0]).toBe('sample');
        expect(record.mock.calls[0][2]).not.toHaveProperty('durationMs');
    });

    it('reads the recorder on each stop, so one set later is used', () => {
        const slot: { recorder?: { record: jest.Mock } } = {};
        const pipeline = new PipelinePerfTraceBackend(() => slot.recorder);
        pipeline.stop(result());
        slot.recorder = { record: jest.fn() };
        pipeline.stop(result());

        expect(slot.recorder.record).toHaveBeenCalledTimes(1);
    });

    it('swallows a recorder that throws', () => {
        const pipeline = new PipelinePerfTraceBackend(() => ({
            record: () => {
                throw new Error('recorder');
            },
        }));

        expect(() => pipeline.stop(result())).not.toThrow();
    });
});
