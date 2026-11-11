/**
 * `lib/report-logs/badgeClass.spec.ts`
 */
import { describe, expect, it } from 'vitest';

import { levelBadgeClass, levelTextClass, rowBadge, typeBadgeClass } from './badgeClass';
import type { ReportLogRow } from './parseReportLog';

const row = (over: Partial<ReportLogRow> = {}): ReportLogRow => ({
    id: 'r',
    type: 'error',
    title: 't',
    payload: null,
    raw: {},
    parseError: false,
    ...over,
});

describe('rowBadge', () => {
    it('labels a log entry by its level, not by its kind', () => {
        // Every batch row shares the `log-entry` kind, so the kind carries no information;
        // the level is the axis an operator scans by.
        expect(rowBadge(row({ type: 'log-entry', level: 'warn' })).label).toBe('warn');
    });

    it('falls back to "log" for a level-less log entry', () => {
        expect(rowBadge(row({ type: 'log-entry' })).label).toBe('log');
    });

    it('labels a report by its kind', () => {
        expect(rowBadge(row({ type: 'issue' })).label).toBe('issue');
    });

    it('gives an unknown level the neutral badge rather than nothing', () => {
        const badge = rowBadge(row({ type: 'log-entry', level: 'trace' }));
        expect(badge.label).toBe('trace');
        expect(badge.className).toBeTruthy();
    });
});

describe('level lookups', () => {
    it('resolves the known levels', () => {
        expect(levelBadgeClass('error')).toContain('destructive');
        expect(levelTextClass('error')).toContain('destructive');
    });

    it('falls back for an unknown or missing level', () => {
        expect(levelBadgeClass(undefined)).toBe('bg-muted text-muted-foreground');
        expect(levelBadgeClass('nope')).toBe('bg-muted text-muted-foreground');
        expect(levelTextClass(undefined)).toBe('text-foreground');
    });

    // `row.level` is whatever the device put in `meta.level` — no union check on the way
    // in. A plain-object lookup would inherit these off `Object.prototype` and hand back a
    // function, which is truthy and would survive into a className.
    it.each(['toString', 'constructor', 'valueOf', '__proto__', 'hasOwnProperty'])(
        'returns a string for the prototype key %s',
        key => {
            expect(typeof levelBadgeClass(key)).toBe('string');
            expect(typeof levelTextClass(key)).toBe('string');
            expect(typeof rowBadge(row({ type: 'log-entry', level: key })).className).toBe('string');
        }
    );
});

describe('typeBadgeClass', () => {
    it('covers every kind', () => {
        for (const type of ['error', 'issue', 'log-entry', 'unknown'] as const) {
            expect(typeof typeBadgeClass(type)).toBe('string');
        }
    });
});
