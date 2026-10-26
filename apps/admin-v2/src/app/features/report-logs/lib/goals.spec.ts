import { describe, expect, it } from 'vitest';

import { GOALS, readGoal } from './goals';
import type { ReportLogRow } from './parseReportLog';

const period = { fromMs: 0, toMs: 10_000 };
const stat = (over: Partial<ReportLogRow>): ReportLogRow => ({
    id: Math.random().toString(),
    type: 'log-entry',
    title: '',
    payload: null,
    raw: null,
    parseError: false,
    timestamp: 5_000,
    ...over,
});

const goal = (key: string) => {
    const found = GOALS.find(g => g.key === key);
    if (!found) throw new Error(`no goal ${key}`);
    return found;
};

describe('readGoal', () => {
    it('reads a target at its percentile and gives a verdict', () => {
        const rows = [800, 900, 1_000, 1_100, 1_200].map(durationMs =>
            stat({ tag: 'perf.boot', recordKind: 'trace', durationMs })
        );
        const reading = readGoal(goal('boot'), rows, period);
        expect(reading.n).toBe(5);
        expect(reading.value).toBeCloseTo(1_180);
        expect(reading.verdict).toBe('met');
        expect(readGoal(goal('switch'), rows, period).verdict).toBe('noData');
    });

    it('reads only the matching vital, and leaves room entry without a verdict', () => {
        const rows = [
            stat({
                tag: 'perf.web_vitals',
                recordKind: 'sample',
                attrs: { vital: 'lcp' },
                metrics: { value_ms: 3_000 },
            }),
            stat({ tag: 'perf.web_vitals', recordKind: 'sample', attrs: { vital: 'fcp' }, metrics: { value_ms: 500 } }),
            stat({ tag: 'perf.chat_room_open', recordKind: 'trace', durationMs: 400 }),
        ];
        expect(readGoal(goal('lcp'), rows, period)).toMatchObject({ n: 1, verdict: 'missed' });
        expect(readGoal(goal('fcp'), rows, period)).toMatchObject({ n: 1, verdict: 'met' });
        expect(readGoal(goal('roomEntry'), rows, period).verdict).toBe('none');
    });

    it('ignores records outside the window and logs that share a tag', () => {
        const rows = [
            stat({ tag: 'perf.boot', recordKind: 'trace', durationMs: 100, timestamp: 20_000 }),
            stat({ tag: 'perf.boot', durationMs: 100 }),
        ];
        expect(readGoal(goal('boot'), rows, period).n).toBe(0);
    });
});
