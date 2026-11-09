/**
 * `lib/perfDetails.spec.ts`
 *
 * The performance-details numbers: outcome order, cache medians, sampled counts weighed by `1/sr`,
 * what counts as a failure, the highlight thresholds, and CLS read back from its ×1000 storage.
 */
import { describe, expect, it } from 'vitest';

import type { ReportLogRow } from './parseReportLog';
import {
    endpointStats,
    failureShare,
    isFailed,
    NONE,
    otherVitals,
    roomCacheUse,
    roomEntryPaths,
    roomOutcomes,
    sendStats,
    stallScreens,
} from './perfDetails';

let seq = 0;
const row = (fields: Partial<ReportLogRow>): ReportLogRow => ({
    id: String(++seq),
    type: 'log-entry',
    title: fields.tag ?? 'perf',
    payload: null,
    raw: {},
    parseError: false,
    recordKind: 'trace',
    ...fields,
});

describe('roomOutcomes', () => {
    it('lists the known outcomes in their order, then unknown and missing values by count', () => {
        const rows = [
            row({ attrs: { outcome: 'timeout' } }),
            row({ attrs: { outcome: 'shown' } }),
            row({ attrs: { outcome: 'shown' } }),
            row({ attrs: { outcome: 'weird' } }),
            row({}),
            row({}),
        ];
        expect(roomOutcomes(rows)).toEqual([
            { key: 'shown', count: 2 },
            { key: 'timeout', count: 1 },
            { key: NONE, count: 2 },
            { key: 'weird', count: 1 },
        ]);
    });
});

describe('roomCacheUse', () => {
    it('gives each cache value its share and median entry time', () => {
        const rows = [
            row({ attrs: { cache: 'hit' }, durationMs: 100 }),
            row({ attrs: { cache: 'hit' }, durationMs: 300 }),
            row({ attrs: { cache: 'hit' }, durationMs: 200 }),
            row({ attrs: { cache: 'miss' }, durationMs: 900 }),
        ];
        expect(roomCacheUse(rows)).toEqual([
            { key: 'hit', count: 3, median: 200 },
            { key: 'miss', count: 1, median: 900 },
        ]);
    });
});

describe('roomEntryPaths', () => {
    it('reads median and p95 per entry path without the overall row', () => {
        const rows = [10, 20, 30, 40, 50].map(ms => row({ attrs: { entry: 'list' }, durationMs: ms }));
        rows.push(row({ attrs: { entry: 'push_banner' }, durationMs: 500 }));
        const paths = roomEntryPaths(rows);
        expect(paths.map(path => path.key)).toEqual(['list', 'push_banner']);
        expect(paths[0]).toMatchObject({ n: 5, p50: 30, p95: 48 });
    });
});

describe('isFailed', () => {
    it('fails a 4xx or 5xx status class, or an outcome other than ok/success', () => {
        expect(isFailed(row({ attrs: { status_class: '5xx', outcome: 'ok' } }))).toBe(true);
        expect(isFailed(row({ attrs: { status_class: '4xx' } }))).toBe(true);
        expect(isFailed(row({ attrs: { status_class: 'none', outcome: 'error' } }))).toBe(true);
        expect(isFailed(row({ attrs: { status_class: '2xx', outcome: 'OK' } }))).toBe(false);
        expect(isFailed(row({ attrs: { outcome: 'success' } }))).toBe(false);
    });

    it('treats a record without either value as not failed', () => {
        expect(isFailed(row({}))).toBe(false);
        expect(isFailed(row({ attrs: { status_class: 'none' } }))).toBe(false);
    });
});

describe('failureShare', () => {
    it('weighs each record by its sampling rate', () => {
        const rows = [
            row({ sr: 0.2, attrs: { outcome: 'error' } }),
            row({ sr: 1, attrs: { outcome: 'ok' } }),
            row({ sr: 1, attrs: { outcome: 'ok' } }),
            row({ sr: 1, attrs: { outcome: 'ok' } }),
            row({ sr: 1, attrs: { outcome: 'ok' } }),
            row({ sr: 1, attrs: { outcome: 'ok' } }),
        ];
        expect(failureShare(rows)).toBeCloseTo(0.5);
        expect(failureShare([])).toBeUndefined();
    });
});

describe('endpointStats', () => {
    const request = (endpoint: string, method: string, rtt: number, extra: Record<string, string> = {}) =>
        row({
            recordKind: 'sample',
            sr: 0.2,
            attrs: { endpoint, method, status_class: '2xx', outcome: 'ok', ...extra },
            metrics: { rtt_ms: rtt },
        });

    it('groups by method and endpoint, estimates counts and sorts by them', () => {
        const rows = [
            request('/a', 'GET', 100, { backend: 'relay' }),
            request('/a', 'GET', 200, { backend: 'cloud' }),
            request('/a', 'POST', 50),
            request('/b', 'GET', 300),
            request('/b', 'GET', 300),
            request('/b', 'GET', 300),
        ];
        const stats = endpointStats(rows);
        expect(stats.map(stat => stat.key)).toEqual(['GET /b', 'GET /a', 'POST /a']);
        expect(stats[0]).toMatchObject({ estimated: 15, n: 3, p50: 300 });
        expect(stats[1].backends).toEqual(['cloud', 'relay']);
        expect(stats[2].backends).toEqual([]);
    });

    it('flags a failure rate of 5% or more and a p95 of 1 s or more', () => {
        const rows = [
            ...Array.from({ length: 19 }, () => request('/ok', 'GET', 100)),
            request('/ok', 'GET', 100, { status_class: '5xx', outcome: 'error' }),
            ...Array.from({ length: 5 }, () => request('/slow', 'GET', 1_200)),
            request('/rare', 'GET', 1_500, { status_class: '5xx', outcome: 'error' }),
        ];
        const [ok, slow, rare] = endpointStats(rows);
        expect(ok).toMatchObject({ key: 'GET /ok', failing: true, slow: false });
        expect(ok.failureRate).toBeCloseTo(0.05);
        expect(slow).toMatchObject({ key: 'GET /slow', failing: false, slow: true });
        // One record is not a failure rate: no highlight below five.
        expect(rare).toMatchObject({ key: 'GET /rare', failureRate: 1, failing: false, slow: false });
    });
});

describe('sendStats', () => {
    it('splits sends by the chosen attribute with their failures', () => {
        const rows = [
            row({ sr: 0.2, durationMs: 100, attrs: { thread: 'root', kind: 'text', outcome: 'ok' } }),
            row({ sr: 0.2, durationMs: 300, attrs: { thread: 'root', kind: 'text', outcome: 'error' } }),
            row({ sr: 0.2, durationMs: 200, attrs: { thread: 'reply', kind: 'text', outcome: 'ok' } }),
        ];
        const byThread = sendStats(rows, 'thread');
        expect(byThread.map(group => group.key)).toEqual(['root', 'reply']);
        expect(byThread[0]).toMatchObject({ estimated: 10, p50: 200, failureRate: 0.5 });
        expect(sendStats(rows, 'kind')).toMatchObject([{ key: 'text', estimated: 15 }]);
    });
});

describe('stallScreens', () => {
    it('estimates stalled visits per screen, the median stalled time and the worst stall', () => {
        const stall = (screen: string, total: number, max: number) =>
            row({
                recordKind: 'sample',
                sr: 0.2,
                attrs: { screen },
                metrics: { count: 1, total_ms: total, max_ms: max },
            });
        const rows = [
            stall('/home', 100, 80),
            stall('/home', 300, 0),
            stall('/home', 200, 120),
            stall('/room', 60, 60),
        ];
        expect(stallScreens(rows)).toEqual([
            { screen: '/home', n: 3, estimated: 15, medianTotalMs: 200, worstMaxMs: 120 },
            { screen: '/room', n: 1, estimated: 5, medianTotalMs: 60, worstMaxMs: 60 },
        ]);
    });

    it('leaves the worst stall empty when no visit owned its max', () => {
        const rows = [row({ attrs: { screen: '/x' }, metrics: { total_ms: 70, max_ms: 0 } })];
        expect(stallScreens(rows)[0].worstMaxMs).toBeUndefined();
    });
});

describe('otherVitals', () => {
    const vital = (name: string, value: number) =>
        row({ recordKind: 'sample', attrs: { vital: name }, metrics: { value_ms: value } });

    it('reads p75 of INP, CLS and TTFB and compares each with its reference', () => {
        const rows = [
            vital('inp', 100),
            vital('inp', 150),
            vital('inp', 250),
            vital('inp', 300),
            vital('cls', 50),
            vital('cls', 250),
            vital('fcp', 1_000),
        ];
        const [inp, cls, ttfb] = otherVitals(rows);
        expect(inp).toEqual({ vital: 'inp', n: 4, p75: 262.5, within: false });
        expect(cls.vital).toBe('cls');
        expect(cls.p75).toBeCloseTo(0.2);
        expect(cls.within).toBe(false);
        expect(ttfb).toEqual({ vital: 'ttfb', n: 0, p75: undefined, within: undefined });
    });
});
