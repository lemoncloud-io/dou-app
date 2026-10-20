import { describe, expect, it } from 'vitest';

import type { DomainChannel, DomainChat } from '@chatic/data';

import { activityAt, sortByRecency } from './sortByRecency';

const channel = (id: string, updatedAt?: number) => ({ id, name: id, updatedAt }) as DomainChannel;
const chat = (createdAt: number) => ({ createdAt }) as DomainChat;

describe('sortByRecency', () => {
    it('puts the channel whose last message is newest first', () => {
        const last = new Map([
            ['a', chat(100)],
            ['b', chat(300)],
            ['c', chat(200)],
        ]);

        expect(sortByRecency([channel('a'), channel('b'), channel('c')], last).map(c => c.id)).toEqual(['b', 'c', 'a']);
    });

    it("falls back to the channel's own update time when nothing is cached for it", () => {
        const last = new Map([['a', chat(100)]]);

        expect(sortByRecency([channel('a'), channel('b', 150), channel('c')], last).map(c => c.id)).toEqual([
            'b',
            'a',
            'c',
        ]);
    });

    it('keeps the given order between channels with the same time', () => {
        expect(sortByRecency([channel('a', 5), channel('b', 5)], new Map()).map(c => c.id)).toEqual(['a', 'b']);
    });

    it('reads a string time as a date', () => {
        expect(activityAt(channel('a', '2026-10-20T00:00:00Z' as unknown as number), undefined)).toBe(
            Date.parse('2026-10-20T00:00:00Z')
        );
    });
});
