/**
 * `api/cost-monitor/costQuery.spec.ts`
 */
import { describe, expect, it } from 'vitest';

import { foldRows, isDayOpen, rowDays } from './costQuery';

import type { Tenant } from '../lib/relations';

const tenant = (key: string, workspaceId?: string): Tenant => ({
    key,
    workspaceId,
    workspaces: [],
    slots: [],
    dou: false,
});
const day = (t: string) => ({ data: { usage: {} as never, series: { sqsRequests: [{ t, v: 1 }] } }, error: null });

describe('rowDays', () => {
    it('asks for the two days before the date and the date itself', () => {
        expect(rowDays('2026-11-01')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
    });
});

describe('isDayOpen', () => {
    it('keeps a KST day open until an hour after it ends', () => {
        // KST 2026-11-01 ends at 2026-11-01T15:00Z.
        expect(isDayOpen('2026-11-01', Date.parse('2026-11-01T15:59:00Z'))).toBe(true);
        expect(isDayOpen('2026-11-01', Date.parse('2026-11-01T16:01:00Z'))).toBe(false);
    });
});

describe('foldRows', () => {
    const days = ['d1', 'd2'];

    it('shows a row once all its days are in, and merges them', () => {
        const rows = foldRows([tenant('a', 'w1'), tenant('b', 'w2')], days, [
            day('2026-11-01T00:00:00Z'),
            day('2026-11-01T01:00:00Z'),
            day('2026-11-01T00:00:00Z'),
            { data: undefined, error: null },
        ]);

        expect(rows.get('a')?.series?.sqsRequests).toHaveLength(2);
        expect(rows.has('b')).toBe(false);
    });

    it('lets a failed day stand for the row', () => {
        const rows = foldRows([tenant('a', 'w1')], days, [
            day('2026-11-01T00:00:00Z'),
            { data: undefined, error: new Error('token invalid') },
        ]);

        expect(rows.get('a')).toEqual({ error: 'token invalid' });
    });

    it('keeps a day that has data when its refetch fails', () => {
        const rows = foldRows([tenant('a', 'w1')], days, [
            day('2026-11-01T00:00:00Z'),
            { ...day('2026-11-01T01:00:00Z'), error: new Error('throttled') },
        ]);

        expect(rows.get('a')?.series?.sqsRequests).toHaveLength(2);
    });

    it('counts a row with no workspace as done and empty', () => {
        expect(foldRows([tenant('slot:1')], days, []).get('slot:1')).toEqual({});
    });
});
