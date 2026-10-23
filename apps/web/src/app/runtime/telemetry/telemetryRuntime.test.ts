import { logHub } from '@chatic/bridges';

import {
    noteStatisticsDropped,
    observeScreenViews,
    selectTelemetryForUpload,
    startTelemetry,
} from './telemetryRuntime';

import type { LogEntry } from '@chatic/bridges';

jest.mock('../perf', () => ({ setPerfTelemetryRecorder: jest.fn() }));

const collect = () => {
    const entries: LogEntry[] = [];
    const unsubscribe = logHub.subscribe(entry => entries.push(entry));
    return { entries, unsubscribe };
};

const router = (pathname: string) => {
    let listener: ((state: { location: { pathname: string } }) => void) | undefined;
    return {
        state: { location: { pathname } },
        subscribe: (l: typeof listener) => {
            listener = l;
            return () => undefined;
        },
        go: (next: string) => listener?.({ location: { pathname: next } }),
    };
};

beforeEach(() => localStorage.clear());

describe('startTelemetry', () => {
    it('records no statistics under the default policy — the dark launch', () => {
        const { entries, unsubscribe } = collect();
        const stop = startTelemetry({ context: () => ({ runId: 'r1' }) });
        const r = router('/');
        observeScreenViews(r);
        r.go('/search');
        stop();
        unsubscribe();

        expect(entries).toEqual([]);
    });

    it('records the session start and screen views with structured fields under a policy that is on', () => {
        localStorage.setItem(
            '@chatic/web.telemetry.policy.override',
            JSON.stringify({ version: 2, enabled: true, defaults: { perf: 1, usage: 1 } })
        );
        const { entries, unsubscribe } = collect();
        const stop = startTelemetry({ context: () => ({ runId: 'r1' }), allowPolicyOverride: true });
        const r = router('/');
        observeScreenViews(r);
        r.go('/channels/C1/room');
        stop();
        unsubscribe();

        expect(entries.map(e => e.tag)).toEqual(['usage.session_start', 'usage.screen_view', 'usage.screen_view']);
        expect(entries[2]).toMatchObject({
            kind: 'event',
            level: 'info',
            attrs: { screen: '/channels/:id/room', prev_screen: '/' },
            sr: 1,
            pv: 2,
        });
        expect(typeof entries[2].metrics?.prev_dwell_ms).toBe('number');
    });
});

describe('selectTelemetryForUpload', () => {
    const nativeBoot: LogEntry = {
        id: 'b',
        level: 'info',
        tag: 'perf.boot',
        message: 'boot',
        kind: 'trace',
        timestamp: 1,
        runId: 'r1',
        durationMs: 900,
    };

    it('lets every statistic go when statistics are off', () => {
        const stop = startTelemetry({ context: () => ({ runId: 'r1' }) });
        expect(selectTelemetryForUpload([nativeBoot])).toEqual([]);
        stop();
    });

    it('lets everything go before telemetry has started, which is the default policy', () => {
        expect(selectTelemetryForUpload([nativeBoot])).toEqual([]);
    });

    it('judges and stamps a native statistic when statistics are on', () => {
        localStorage.setItem(
            '@chatic/web.telemetry.policy.override',
            JSON.stringify({ version: 3, enabled: true, defaults: { perf: 1 } })
        );
        const stop = startTelemetry({ context: () => ({ runId: 'r1' }), allowPolicyOverride: true });

        expect(selectTelemetryForUpload([nativeBoot])).toEqual([{ ...nativeBoot, sr: 1, pv: 3 }]);
        stop();
    });
});

describe('noteStatisticsDropped', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const drop = (tag: string): LogEntry => ({ level: 'info', tag, message: '', kind: 'sample', timestamp: 1 });

    it('reports drops once a minute as a telemetry_dropped sample, not counting its own reports', () => {
        localStorage.setItem(
            '@chatic/web.telemetry.policy.override',
            JSON.stringify({ version: 1, enabled: true, defaults: { perf: 1, usage: 1 } })
        );
        const { entries, unsubscribe } = collect();
        const stop = startTelemetry({ context: () => ({ runId: 'r1' }), allowPolicyOverride: true });
        noteStatisticsDropped([
            drop('perf.bridge_request'),
            drop('perf.telemetry_dropped'),
            drop('perf.bridge_request'),
        ]);
        jest.advanceTimersByTime(60_000);
        noteStatisticsDropped([drop('perf.telemetry_dropped')]);
        jest.advanceTimersByTime(60_000);
        stop();
        unsubscribe();

        const reports = entries.filter(e => e.tag === 'perf.telemetry_dropped');
        expect(reports).toHaveLength(1);
        expect(reports[0].metrics).toEqual({ count: 2 });
    });
});
