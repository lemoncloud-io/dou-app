import { samplingBucket } from './bucket';
import { TelemetrySampler } from './TelemetrySampler';

import type { LogEntry } from '../core/types';
import type { TelemetryPolicy } from './policy';

const NOW = 1_800_000_000_000;
const on = (extra: Partial<TelemetryPolicy> = {}): TelemetryPolicy => ({
    version: 5,
    enabled: true,
    defaults: { perf: 0.5, usage: 1 },
    ...extra,
});

/** A run id that falls below / above 0.5 for the perf stream. */
const findRun = (below: boolean): string => {
    for (let i = 0; ; i += 1) {
        const run = `run-${i}`;
        if (samplingBucket(run, 'perf') < 0.5 === below) return run;
    }
};

describe('TelemetrySampler.decide', () => {
    it('keeps nothing under the default policy', () => {
        const sampler = new TelemetrySampler({ runId: 'r1' });
        expect(sampler.decide('perf', 'perf.boot').sampled).toBe(false);
        expect(sampler.decide('usage', 'usage.screen_view').sampled).toBe(false);
        expect(sampler.version).toBe(0);
    });

    it('gives the same run the same verdict every time', () => {
        const run = findRun(true);
        const a = new TelemetrySampler({ policy: on(), runId: run, now: () => NOW });
        const b = new TelemetrySampler({ policy: on(), runId: run, now: () => NOW });
        for (let i = 0; i < 5; i += 1) expect(a.decide('perf', 'perf.boot')).toEqual(b.decide('perf', 'perf.boot'));
        expect(a.decide('perf', 'perf.boot')).toEqual({ sampled: true, sr: 0.5, pv: 5, forced: false });
    });

    it('drops a run whose bucket is at or above the rate', () => {
        const sampler = new TelemetrySampler({ policy: on(), runId: findRun(false), now: () => NOW });
        expect(sampler.decide('perf', 'perf.boot').sampled).toBe(false);
    });

    it('prefers the record context run id over its own', () => {
        const sampler = new TelemetrySampler({ policy: on(), runId: findRun(false), now: () => NOW });
        expect(sampler.decide('perf', 'perf.boot', { runId: findRun(true) }).sampled).toBe(true);
    });

    it('does not sample a fractional rate without a run id', () => {
        const sampler = new TelemetrySampler({ policy: on(), now: () => NOW });
        expect(sampler.decide('perf', 'perf.boot').sampled).toBe(false);
        expect(sampler.decide('usage', 'usage.screen_view').sampled).toBe(true);
    });

    it('takes the kill switch and overrides from updateSwitches, but not new rates', () => {
        const sampler = new TelemetrySampler({ policy: on(), runId: findRun(false), now: () => NOW });
        sampler.updateSwitches({
            version: 9,
            enabled: true,
            defaults: { perf: 1 },
            force: [{ runId: 'other', until: NOW + 1 }],
        });
        expect(sampler.decide('perf', 'perf.boot').sampled).toBe(false);
        expect(sampler.version).toBe(5);

        sampler.updateSwitches({ version: 9, enabled: false });
        expect(sampler.isEnabled()).toBe(false);
        expect(sampler.decide('usage', 'usage.screen_view').sampled).toBe(false);
    });

    it('forces a run to 100% once an override for it arrives', () => {
        const run = findRun(false);
        const sampler = new TelemetrySampler({ policy: on(), runId: run, now: () => NOW });
        sampler.updateSwitches({ version: 5, enabled: true, force: [{ runId: run, until: NOW + 60_000 }] });
        expect(sampler.decide('perf', 'perf.boot')).toEqual({ sampled: true, sr: 1, pv: 5, forced: true });
    });
});

describe('TelemetrySampler.selectForUpload', () => {
    const native = (runId: string): LogEntry => ({
        id: `n-${runId}`,
        runId,
        level: 'info',
        tag: 'perf.boot',
        message: 'boot',
        kind: 'trace',
        timestamp: 1,
        durationMs: 900,
    });

    it('sends nothing while switched off', () => {
        const sampler = new TelemetrySampler({ policy: on({ enabled: false }), now: () => NOW });
        expect(sampler.selectForUpload([native(findRun(true)), { ...native('x'), sr: 1 }])).toEqual([]);
    });

    it('passes through a record already judged when it was made', () => {
        const sampler = new TelemetrySampler({ policy: on(), now: () => NOW });
        const judged = { ...native(findRun(false)), sr: 0.5, pv: 5 };
        expect(sampler.selectForUpload([judged])).toEqual([judged]);
    });

    it('judges a native record by its own run and stamps sr and pv', () => {
        const sampler = new TelemetrySampler({ policy: on(), now: () => NOW });
        const kept = native(findRun(true));
        const dropped = native(findRun(false));

        expect(sampler.selectForUpload([kept, dropped])).toEqual([{ ...kept, sr: 0.5, pv: 5 }]);
    });

    it('marks a forced native record', () => {
        const run = findRun(false);
        const sampler = new TelemetrySampler({
            policy: on({ force: [{ runId: run, until: NOW + 1 }] }),
            now: () => NOW,
        });
        expect(sampler.selectForUpload([native(run)])[0]).toMatchObject({ sr: 1, attrs: { forced: '1' } });
    });
});
