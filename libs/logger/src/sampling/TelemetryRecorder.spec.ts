import { TelemetryRecorder } from './TelemetryRecorder';
import { TelemetrySampler } from './TelemetrySampler';

import type { LogEntry } from '../core/types';
import type { TelemetryCatalog } from './catalog';

const catalog: TelemetryCatalog = {
    'perf.chat_room_open': {
        kinds: ['trace'],
        attrs: { entry: ['list', 'push'], cache: ['hit', 'miss'], screen: true },
        metrics: ['mount', 'message_count'],
    },
    'perf.web_vitals': { kinds: ['sample'], attrs: { vital: ['fcp', 'lcp'] }, metrics: ['value_ms'] },
    'usage.screen_view': { kinds: ['event'], attrs: { screen: true } },
};

const everything = { version: 4, enabled: true, defaults: { perf: 1, usage: 1 } };

const build = (policy = everything, context = () => ({ runId: 'r1', uid: 'u1', platform: 'web' as const })) => {
    const published: LogEntry[] = [];
    const onReject = jest.fn();
    const recorder = new TelemetryRecorder({
        publish: entry => published.push(entry),
        context,
        sampler: new TelemetrySampler({ policy, runId: 'r1', now: () => 1000 }),
        catalog,
        now: () => 1000,
        onReject,
    });
    return { recorder, published, onReject };
};

describe('TelemetryRecorder', () => {
    it('creates no entry under the default policy', () => {
        const published: LogEntry[] = [];
        const recorder = new TelemetryRecorder({
            publish: entry => published.push(entry),
            sampler: new TelemetrySampler({ runId: 'r1' }),
            catalog,
        });

        recorder.trace('chat_room_open', { durationMs: 10 });
        recorder.sample('web_vitals', { attrs: { vital: 'lcp' }, metrics: { value_ms: 1 } });
        recorder.event('screen_view', { attrs: { screen: '/' } });

        expect(published).toEqual([]);
    });

    it('builds a trace entry with context, structured fields, sr, pv and seq', () => {
        const { recorder, published } = build();

        recorder.trace('chat_room_open', { durationMs: 381, attrs: { entry: 'list' }, metrics: { mount: 327 } });

        expect(published[0]).toMatchObject({
            runId: 'r1',
            uid: 'u1',
            platform: 'web',
            level: 'info',
            tag: 'perf.chat_room_open',
            message: 'chat_room_open',
            kind: 'trace',
            timestamp: 1000,
            durationMs: 381,
            attrs: { entry: 'list' },
            metrics: { mount: 327 },
            sr: 1,
            pv: 4,
            seq: 1,
        });
        expect(typeof published[0].id).toBe('string');
    });

    it('tags events with usage and keeps no duration on non-traces', () => {
        const { recorder, published } = build();

        recorder.event('screen_view', { attrs: { screen: '/channels/:id' }, durationMs: 5 });

        expect(published[0]).toMatchObject({ tag: 'usage.screen_view', kind: 'event' });
        expect(published[0]).not.toHaveProperty('durationMs');
    });

    it('increments seq per kept record', () => {
        const { recorder, published } = build();

        recorder.event('screen_view');
        recorder.event('screen_view');

        expect(published.map(e => e.seq)).toEqual([1, 2]);
    });

    it('refuses a record outside the catalogue and reports it', () => {
        const { recorder, published, onReject } = build();

        recorder.event('purchase_done');
        recorder.sample('chat_room_open', {});

        expect(published).toEqual([]);
        expect(onReject.mock.calls.map(([r]) => r.reason)).toEqual(['unknown_record', 'wrong_kind']);
    });

    it('refuses a trace without a usable duration', () => {
        const { recorder, published, onReject } = build();

        recorder.trace('chat_room_open', {});

        expect(published).toEqual([]);
        expect(onReject).toHaveBeenCalledWith({ tag: 'perf.chat_room_open', reason: 'bad_duration' });
    });

    it('drops attributes and values the catalogue does not allow, keeping the record', () => {
        const { recorder, published, onReject } = build();

        recorder.trace('chat_room_open', {
            durationMs: 1,
            attrs: { entry: 'deeplink', cache: 'hit', userName: 'kim', screen: 'x'.repeat(101) },
            metrics: { mount: 1.6, bytes: 3, message_count: Number.NaN },
        });

        expect(published[0].attrs).toEqual({ cache: 'hit' });
        expect(published[0].metrics).toEqual({ mount: 2 });
        expect(onReject.mock.calls.map(([r]) => `${r.reason}:${r.key}`).sort()).toEqual(
            [
                'bad_attr_value:entry',
                'unknown_attr:userName',
                'bad_attr_value:screen',
                'unknown_metric:bytes',
                'bad_metric_value:message_count',
            ].sort()
        );
    });

    it('reports refusals even while statistics are off', () => {
        const { recorder, onReject } = build({ version: 0, enabled: false } as typeof everything);

        recorder.event('nope');

        expect(onReject).toHaveBeenCalledWith({ tag: 'usage.nope', reason: 'unknown_record' });
    });

    it('marks a forced record', () => {
        const { recorder, published } = build({
            version: 1,
            enabled: true,
            defaults: { perf: 0, usage: 0 },
            force: [{ uid: 'u1', until: 2000 }],
        } as typeof everything);

        recorder.event('screen_view');

        expect(published[0]).toMatchObject({ sr: 1, attrs: { forced: '1' } });
        expect(Object.keys(published[0].attrs ?? {})[0]).toBe('forced');
    });

    it('survives a throwing context provider and a throwing reject hook', () => {
        const published: LogEntry[] = [];
        const recorder = new TelemetryRecorder({
            publish: entry => published.push(entry),
            context: () => {
                throw new Error('provider');
            },
            sampler: new TelemetrySampler({ policy: everything, runId: 'r1' }),
            catalog,
            onReject: () => {
                throw new Error('hook');
            },
        });

        expect(() => recorder.event('unknown')).not.toThrow();
        recorder.event('screen_view');
        expect(published).toHaveLength(1);
    });
});
