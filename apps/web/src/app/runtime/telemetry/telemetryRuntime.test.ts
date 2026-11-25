import { logHub, recordTelemetry } from '@chatic/bridges';

import { recordAppIconChange, reportAppIconInUse } from './appIcon';
import {
    noteStatisticsDropped,
    observeScreenViews,
    onUsageSessionStart,
    selectTelemetryForUpload,
    startTelemetry,
} from './telemetryRuntime';

import type { LogEntry } from '@chatic/bridges';

jest.mock('../perf', () => ({ setPerfTelemetryRecorder: jest.fn() }));
jest.mock('@chatic/runtime-react', () =>
    require('@chatic/runtime-react/testing').fakeRuntimeModule({
        diagnostics: require('@chatic/runtime-react/testing').browserDiagnostics(),
    })
);

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

describe('startTelemetry — the process recorder', () => {
    it('lets code without its own recorder record through the run policy (the HTTP layer)', () => {
        localStorage.setItem(
            '@chatic/web.telemetry.policy.override',
            JSON.stringify({ version: 1, enabled: true, defaults: { perf: 1 } })
        );
        const { entries, unsubscribe } = collect();
        const stop = startTelemetry({ context: () => ({ runId: 'r1' }), allowPolicyOverride: true });
        recordTelemetry('sample', 'api_request', {
            attrs: { endpoint: '/clouds/:id', method: 'GET', status_class: '2xx', outcome: 'ok' },
            metrics: { rtt_ms: 40 },
        });
        stop();
        recordTelemetry('sample', 'api_request', { metrics: { rtt_ms: 1 } });
        unsubscribe();

        const api = entries.filter(e => e.tag === 'perf.api_request');
        expect(api).toHaveLength(1);
        expect(api[0]).toMatchObject({ kind: 'sample', attrs: { endpoint: '/clouds/:id' }, metrics: { rtt_ms: 40 } });
    });
});

describe('onUsageSessionStart', () => {
    let visibility: DocumentVisibilityState = 'visible';
    beforeAll(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
    });
    const setVisibility = (next: DocumentVisibilityState) => {
        visibility = next;
        document.dispatchEvent(new Event('visibilitychange'));
    };

    it('runs a listener after a later session starts, and not after a short absence or once removed', () => {
        localStorage.setItem(
            '@chatic/web.telemetry.policy.override',
            JSON.stringify({ version: 1, enabled: true, defaults: { usage: 1 } })
        );
        let clock = 0;
        const { entries, unsubscribe } = collect();
        const stop = startTelemetry({ context: () => ({ runId: 'r1' }), allowPolicyOverride: true, now: () => clock });
        const tagsWhenCalled: string[][] = [];
        const remove = onUsageSessionStart(() => tagsWhenCalled.push(entries.map(e => e.tag)));

        setVisibility('hidden');
        clock += 60_000;
        setVisibility('visible');
        expect(tagsWhenCalled).toHaveLength(0);

        setVisibility('hidden');
        clock += 60 * 60_000;
        setVisibility('visible');
        expect(tagsWhenCalled).toHaveLength(1);
        expect(tagsWhenCalled[0].slice(-2)).toEqual(['usage.session_end', 'usage.session_start']);

        remove();
        setVisibility('hidden');
        clock += 60 * 60_000;
        setVisibility('visible');
        expect(tagsWhenCalled).toHaveLength(1);

        stop();
        unsubscribe();
    });
});

describe('app icon usage events', () => {
    it('pass the catalogue and reach the hub as structured usage events', async () => {
        localStorage.setItem(
            '@chatic/web.telemetry.policy.override',
            JSON.stringify({ version: 1, enabled: true, defaults: { usage: 1 } })
        );
        const { entries, unsubscribe } = collect();
        const onReject = jest.fn();
        const stop = startTelemetry({ context: () => ({ runId: 'r1' }), allowPolicyOverride: true, onReject });

        recordAppIconChange('default', 'MidnightIcon');
        recordAppIconChange('MidnightIcon', 'NeonIcon');
        await reportAppIconInUse(() => Promise.resolve({ iconName: 'MidnightIcon', supported: true }));
        stop();
        unsubscribe();

        expect(onReject).not.toHaveBeenCalled();
        const icon = entries.filter(e => e.tag.startsWith('usage.app_icon'));
        expect(icon).toEqual([
            expect.objectContaining({
                tag: 'usage.app_icon_change',
                kind: 'event',
                attrs: { from: 'DefaultIcon', to: 'MidnightIcon' },
            }),
            expect.objectContaining({
                tag: 'usage.app_icon_change',
                kind: 'event',
                attrs: { from: 'MidnightIcon', to: 'other' },
            }),
            expect.objectContaining({ tag: 'usage.app_icon_in_use', kind: 'event', attrs: { icon: 'MidnightIcon' } }),
        ]);
    });
});
