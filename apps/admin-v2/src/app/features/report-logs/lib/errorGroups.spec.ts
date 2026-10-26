import { describe, expect, it } from 'vitest';

import { buildErrorOverview, coversWindow } from './errorGroups';
import type { ReportLogRow } from './parseReportLog';

const FROM = Date.parse('2026-10-26T00:00:00+09:00');
const TO = FROM + 24 * 3_600_000;
const period = { fromMs: FROM, toMs: TO, exact: true };

let seq = 0;
const err = (tag: string, at: number, userId = 'u1'): ReportLogRow => ({
    id: `e${++seq}`,
    type: 'log-entry',
    title: tag,
    tag,
    level: 'error',
    message: `${tag} failed`,
    payload: null,
    raw: null,
    parseError: false,
    userId,
    timestamp: at,
    createdAt: at,
});

describe('coversWindow', () => {
    it('holds the whole window when the fetch was complete or reached past the start', () => {
        expect(coversWindow([err('A', FROM + 10)], false, FROM)).toBe(true);
        expect(coversWindow([err('A', FROM + 10)], true, FROM)).toBe(false);
        expect(coversWindow([err('A', FROM + 10), err('A', FROM - 10)], true, FROM)).toBe(true);
    });
});

describe('buildErrorOverview', () => {
    it('counts from the rows when they cover the window, exactly and by occurrence time', () => {
        const overview = buildErrorOverview({
            rows: [
                err('CHAT', FROM + 1_000, 'u1'),
                err('CHAT', FROM + 2_000, 'u2'),
                err('AUTH', FROM + 3_000),
                err('AUTH', FROM - 5),
            ],
            truncated: false,
            period,
        });
        expect(overview.source).toBe('rows');
        expect(overview.partial).toBe(false);
        expect(overview.total).toBe(3);
        expect(overview.users).toBe(2);
        expect(overview.groups.map(group => [group.tag, group.count, group.users])).toEqual([
            ['CHAT', 2, 2],
            ['AUTH', 1, 1],
        ]);
        expect(overview.groups[0]).toMatchObject({ firstAt: FROM + 1_000, lastAt: FROM + 2_000 });
        expect(overview.groups[0].spark.reduce((a, b) => a + b, 0)).toBe(2);
    });

    it('takes counts from the server when the rows were cut short', () => {
        const overview = buildErrorOverview({
            rows: [err('CHAT', FROM + 1_000)],
            truncated: true,
            period,
            stats: {
                groups: {
                    tag: [
                        { key: 'CHAT', val: 900 },
                        { key: 'AUTH', val: 40 },
                    ],
                },
                users: 120,
            },
            serverTotal: 940,
        });
        expect(overview.source).toBe('server');
        expect(overview.partial).toBe(true);
        expect(overview.total).toBe(940);
        expect(overview.users).toBe(120);
        expect(overview.groups.map(group => [group.tag, group.count, group.users])).toEqual([
            ['CHAT', 900, 1],
            ['AUTH', 40, 0],
        ]);
        expect(overview.wideSpan).toBe(false);
    });

    it('says the server days are wider than a rolling window', () => {
        const overview = buildErrorOverview({
            rows: [err('CHAT', TO - 1_000)],
            truncated: true,
            period: { ...period, exact: false },
            stats: { groups: { tag: [{ key: 'CHAT', val: 3 }] } },
        });
        expect(overview.wideSpan).toBe(true);
    });

    it('falls back to the rows, marked partial, when the server gave no counts', () => {
        const overview = buildErrorOverview({ rows: [err('CHAT', FROM + 1)], truncated: true, period });
        expect(overview).toMatchObject({ source: 'rows', partial: true, total: 1 });
    });
});
