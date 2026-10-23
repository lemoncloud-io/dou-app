import { createNativeTelemetryRecorder } from './nativeTelemetryRecorder';

import type { LogEntry } from '@chatic/logger';

const build = () => {
    const published: LogEntry[] = [];
    const recorder = createNativeTelemetryRecorder({
        context: () => ({ runId: 'run-n', platform: 'ios', host: 'app' }),
        publish: entry => published.push(entry),
        now: () => 5_000,
    });
    return { recorder, published };
};

describe('createNativeTelemetryRecorder', () => {
    it('records boot as an unjudged trace with the native context', () => {
        const { recorder, published } = build();

        recorder.record('trace', 'boot', {
            durationMs: 900,
            attrs: { boot_type: 'cold' },
            metrics: { web_app_ready: 880 },
            timestamp: 4_000,
        });

        expect(published[0]).toMatchObject({
            runId: 'run-n',
            platform: 'ios',
            tag: 'perf.boot',
            level: 'info',
            kind: 'trace',
            durationMs: 900,
            attrs: { boot_type: 'cold' },
            metrics: { web_app_ready: 880 },
            timestamp: 4_000,
            seq: 1,
        });
        expect(published[0]).not.toHaveProperty('sr');
        expect(published[0]).not.toHaveProperty('pv');
    });

    it('records first_screen as a sample without a duration', () => {
        const { recorder, published } = build();

        recorder.record('sample', 'first_screen', { attrs: { reveal: 'handshake' }, metrics: { value_ms: 1_200 } });

        expect(published[0]).toMatchObject({ kind: 'sample', tag: 'perf.first_screen', timestamp: 5_000 });
        expect(published[0]).not.toHaveProperty('durationMs');
    });

    it('drops what the catalogue does not allow', () => {
        const { recorder, published } = build();

        recorder.record('trace', 'boot', { durationMs: 1, attrs: { user: 'x' } });
        recorder.record('trace', 'nope' as never, { durationMs: 1 });

        expect(published).toHaveLength(1);
        expect(published[0]).not.toHaveProperty('attrs');
    });
});
