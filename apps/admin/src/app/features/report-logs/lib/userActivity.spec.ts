import { describe, expect, it } from 'vitest';

import type { ReportLogRow } from './parseReportLog';
import { groupRuns, NO_RUN_KEY, recentUsers, runAt, summarizeUser } from './userActivity';

const T0 = Date.parse('2026-10-26T10:00:00+09:00');
const MIN = 60_000;

let seq = 0;
const log = (over: Partial<ReportLogRow> = {}): ReportLogRow => ({
    id: `r${++seq}`,
    type: 'log-entry',
    title: 'CHAT',
    tag: 'CHAT',
    level: 'info',
    payload: null,
    raw: null,
    parseError: false,
    userId: 'u1',
    runId: 'run-a',
    timestamp: T0,
    createdAt: T0,
    ...over,
});

const report = (over: Partial<ReportLogRow> = {}): ReportLogRow =>
    log({ type: 'issue', tag: undefined, level: undefined, runId: undefined, title: 'Send fails', ...over });

describe('groupRuns', () => {
    it('groups by run, newest run first, each run in occurrence order', () => {
        const runs = groupRuns([
            log({ runId: 'run-a', timestamp: T0 + 2 * MIN }),
            log({ runId: 'run-b', timestamp: T0 + 60 * MIN }),
            log({ runId: 'run-a', timestamp: T0, level: 'error' }),
        ]);
        expect(runs.map(run => run.key)).toEqual(['run-b', 'run-a']);
        expect(runs[1].rows.map(row => row.timestamp)).toEqual([T0, T0 + 2 * MIN]);
        expect(runs[1]).toMatchObject({ errors: 1, startAt: T0, endAt: T0 + 2 * MIN });
    });

    it('puts a report into the run that was going on when it was sent', () => {
        const runs = groupRuns(
            [log({ timestamp: T0 }), log({ timestamp: T0 + 10 * MIN })],
            [report({ timestamp: T0 + 11 * MIN })]
        );
        expect(runs).toHaveLength(1);
        expect(runs[0].reports).toBe(1);
    });

    it('gives a report outside every run a card of its own, and rows without a run a shared one', () => {
        const runs = groupRuns(
            [log({ timestamp: T0 }), log({ runId: undefined, timestamp: T0 + 5 * MIN })],
            [report({ id: 'rep', timestamp: T0 + 300 * MIN })]
        );
        expect(runs.map(run => run.key).sort()).toEqual([NO_RUN_KEY, 'report:rep', 'run-a'].sort());
    });

    it('finds the run that holds an instant', () => {
        const runs = groupRuns([log({ timestamp: T0 }), log({ timestamp: T0 + 10 * MIN })]);
        expect(runAt(runs, T0 + 5 * MIN)?.key).toBe('run-a');
        expect(runAt(runs, T0 + 60 * MIN)).toBeUndefined();
    });
});

describe('summarizeUser', () => {
    it('counts runs, errors and reports, takes the name from a report and flags several clouds', () => {
        const summary = summarizeUser(
            'u1',
            [
                log({ runId: 'a', cid: 'c1', model: 'iPhone15', appVersion: '0.29.0', timestamp: T0 }),
                log({ runId: 'b', cid: 'c2', level: 'error', appVersion: '0.29.2', timestamp: T0 + MIN }),
            ],
            [report({ userName: '홍길동', timestamp: T0 + 2 * MIN })]
        );
        expect(summary).toMatchObject({ runs: 2, errors: 1, reports: 1, name: '홍길동', clouds: ['c1', 'c2'] });
        // The newest value of each device field.
        expect(summary.device).toMatchObject({ model: 'iPhone15', appVersion: '0.29.2' });
        expect(summary.lastSeenAt).toBe(T0 + 2 * MIN);
    });
});

describe('recentUsers', () => {
    it('lists people seen, most recent first, narrowed by id or name', () => {
        const rows = [
            log({ userId: 'u1', timestamp: T0 }),
            log({ userId: 'u2', timestamp: T0 + MIN, level: 'error' }),
            log({ userId: 'u3', userName: 'Kim', timestamp: T0 - MIN }),
            log({ userId: undefined }),
        ];
        expect(recentUsers(rows).map(user => user.uid)).toEqual(['u2', 'u1', 'u3']);
        expect(recentUsers(rows)[0].errors).toBe(1);
        expect(recentUsers(rows, 'kim').map(user => user.uid)).toEqual(['u3']);
        expect(recentUsers(rows, 'u1').map(user => user.uid)).toEqual(['u1']);
    });
});
