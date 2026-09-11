/**
 * `lib/report-logs/logFacets.spec.ts`
 */
import { describe, expect, it } from 'vitest';

import { buildFacets, matchesFacets, matchesQuery } from './logFacets';
import type { ReportLogRow } from './parseReportLog';

const row = (partial: Partial<ReportLogRow> = {}): ReportLogRow => ({
    id: Math.random().toString(),
    type: 'log-entry',
    title: 't',
    payload: null,
    raw: {},
    parseError: false,
    ...partial,
});

describe('buildFacets', () => {
    it('counts values per axis, most frequent first', () => {
        const facets = buildFacets([row({ tag: 'auth' }), row({ tag: 'chat' }), row({ tag: 'auth' })]);

        expect(facets.tag).toEqual([
            { value: 'auth', count: 2 },
            { value: 'chat', count: 1 },
        ]);
    });

    it('breaks count ties alphabetically so the list is stable as pages arrive', () => {
        const facets = buildFacets([row({ appVersion: '1.2.0' }), row({ appVersion: '1.1.0' })]);

        expect(facets.appVersion.map(f => f.value)).toEqual(['1.1.0', '1.2.0']);
    });

    it('skips rows missing the axis instead of bucketing them', () => {
        const facets = buildFacets([row({ tag: 'auth' }), row({}), row({ tag: '' })]);

        expect(facets.tag).toEqual([{ value: 'auth', count: 1 }]);
    });

    it('returns an empty list for every axis when there are no rows', () => {
        const facets = buildFacets([]);

        expect(facets.tag).toEqual([]);
        expect(facets.os).toEqual([]);
    });

    it('counts each axis independently on the same rows', () => {
        const facets = buildFacets([
            row({ level: 'error', tag: 'auth', appVersion: '1.0.0' }),
            row({ level: 'error', tag: 'chat', appVersion: '1.0.0' }),
        ]);

        expect(facets.level).toEqual([{ value: 'error', count: 2 }]);
        expect(facets.appVersion).toEqual([{ value: '1.0.0', count: 2 }]);
        expect(facets.tag).toHaveLength(2);
    });
});

describe('matchesFacets', () => {
    it('requires every selected axis to match', () => {
        const r = row({ tag: 'auth', appVersion: '1.0.0' });

        expect(matchesFacets(r, { tag: 'auth', appVersion: '1.0.0' })).toBe(true);
        expect(matchesFacets(r, { tag: 'auth', appVersion: '2.0.0' })).toBe(false);
    });

    it('treats an empty selection as no filter', () => {
        expect(matchesFacets(row({}), {})).toBe(true);
        expect(matchesFacets(row({ tag: 'auth' }), { tag: '' })).toBe(true);
    });

    it('excludes a row that lacks the selected axis', () => {
        expect(matchesFacets(row({}), { tag: 'auth' })).toBe(false);
    });
});

describe('matchesQuery', () => {
    it('matches on any searchable field', () => {
        const r = row({ title: 'boom', userId: '1000123', cid: 'cloud-9' });

        expect(matchesQuery(r, 'boom')).toBe(true);
        expect(matchesQuery(r, '1000123')).toBe(true);
        expect(matchesQuery(r, 'cloud-9')).toBe(true);
    });

    it('is case-insensitive', () => {
        expect(matchesQuery(row({ message: 'Network Error' }), 'network')).toBe(true);
    });

    it('requires all terms but not their adjacency', () => {
        const r = row({ title: 'boom', userId: '1000123' });

        expect(matchesQuery(r, 'boom 1000123')).toBe(true);
        expect(matchesQuery(r, '1000123 boom')).toBe(true);
        expect(matchesQuery(r, 'boom nothere')).toBe(false);
    });

    it('treats a blank query as no filter', () => {
        expect(matchesQuery(row({}), '')).toBe(true);
        expect(matchesQuery(row({}), '   ')).toBe(true);
    });
});
