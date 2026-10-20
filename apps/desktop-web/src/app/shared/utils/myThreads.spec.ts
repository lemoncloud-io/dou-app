import { describe, expect, it } from 'vitest';

import {
    MY_THREADS_MAX,
    isThreadUnread,
    markThreadSeen,
    myThreadKey,
    recordThreadReply,
    threadChannel,
    threadRootNo,
    type MyThreads,
    type ThreadReply,
} from './myThreads';
import type { DomainChannel } from '@chatic/data';

const reply = (over: Partial<ThreadReply> = {}): ThreadReply => ({
    cid: 'c1',
    channelId: 'ch1',
    placeId: 'p1',
    rootNo: '10',
    replyNo: 11,
    preview: 'hello',
    ownerName: 'Kim',
    at: 1_000,
    mine: false,
    ...over,
});
const root = { preview: 'the root', ownerName: 'Lee' };

describe('threadRootNo', () => {
    it('reads a persisted reply parentId — the root chatNo string — as is', () => {
        expect(threadRootNo('10')).toBe('10');
    });

    it('reads an optimistic reply parentId — the root full id — as its chatNo', () => {
        expect(threadRootNo('ch1:10')).toBe('10');
    });
});

describe('recordThreadReply', () => {
    it('starts a thread when the root is given', () => {
        const next = recordThreadReply({}, reply(), { root });
        const thread = next[myThreadKey('c1', 'ch1', '10')];
        expect(thread).toMatchObject({
            cid: 'c1',
            channelId: 'ch1',
            placeId: 'p1',
            rootNo: '10',
            rootPreview: 'the root',
            rootOwnerName: 'Lee',
            lastReplyNo: 11,
            lastReplyPreview: 'hello',
            lastReplyOwnerName: 'Kim',
            lastActivityAt: 1_000,
            seenReplyNo: 0,
        });
        expect(isThreadUnread(thread)).toBe(true);
    });

    it('keeps the channel a reply landed in, and learns a root author an older entry lacks', () => {
        const held = { ...recordThreadReply({}, reply(), { root })[myThreadKey('c1', 'ch1', '10')] };
        delete held.rootOwnerName;
        const threads = { [myThreadKey('c1', 'ch1', '10')]: held };

        const next = recordThreadReply(threads, reply({ replyNo: 12, channelKind: 'channel', channelName: 'design' }), {
            root,
        });

        expect(next[myThreadKey('c1', 'ch1', '10')]).toMatchObject({
            rootOwnerName: 'Lee',
            channelKind: 'channel',
            channelName: 'design',
        });
    });

    it('ignores a reply to a thread it does not hold when no root is given', () => {
        const threads: MyThreads = {};
        expect(recordThreadReply(threads, reply())).toBe(threads);
    });

    it('updates a held thread from a later reply without a root', () => {
        const held = recordThreadReply({}, reply(), { root });
        const next = recordThreadReply(held, reply({ replyNo: 12, preview: 'again', at: 2_000 }));
        expect(next[myThreadKey('c1', 'ch1', '10')]).toMatchObject({
            lastReplyNo: 12,
            lastReplyPreview: 'again',
            lastActivityAt: 2_000,
            rootPreview: 'the root',
        });
    });

    it('returns the same object for a reply it has already applied', () => {
        const held = recordThreadReply({}, reply({ replyNo: 12 }), { root });
        expect(recordThreadReply(held, reply({ replyNo: 12 }))).toBe(held);
        expect(recordThreadReply(held, reply({ replyNo: 11 }))).toBe(held);
    });

    it('never marks a thread unread with my own reply', () => {
        const next = recordThreadReply({}, reply({ mine: true }), { root });
        expect(isThreadUnread(next[myThreadKey('c1', 'ch1', '10')])).toBe(false);
    });

    it('keeps the reply number when my own optimistic reply has none yet', () => {
        const held = recordThreadReply({}, reply({ replyNo: 12 }), { root });
        const next = recordThreadReply(held, reply({ replyNo: 0, mine: true, preview: 'sending', at: 3_000 }));
        expect(next[myThreadKey('c1', 'ch1', '10')]).toMatchObject({
            lastReplyNo: 12,
            lastReplyPreview: 'sending',
            lastActivityAt: 3_000,
        });
    });

    it('records a backfilled thread as already seen', () => {
        const next = recordThreadReply({}, reply(), { root, seen: true });
        expect(isThreadUnread(next[myThreadKey('c1', 'ch1', '10')])).toBe(false);
    });

    it('keeps threads of two clouds apart when their channel ids collide', () => {
        const one = recordThreadReply({}, reply(), { root });
        const both = recordThreadReply(one, reply({ cid: 'c2' }), { root });
        expect(Object.keys(both)).toHaveLength(2);
        expect(Object.values(both).map(t => t.cid)).toEqual(['c1', 'c2']);
    });

    it('evicts the least recently active threads past the cap', () => {
        let threads: MyThreads = {};
        for (let n = 0; n <= MY_THREADS_MAX; n++) {
            threads = recordThreadReply(threads, reply({ rootNo: String(n), at: n }), { root });
        }
        expect(Object.keys(threads)).toHaveLength(MY_THREADS_MAX);
        expect(threads[myThreadKey('c1', 'ch1', '0')]).toBeUndefined();
    });

    it('returns the same object for a newcomer older than every kept thread', () => {
        let threads: MyThreads = {};
        for (let n = 1; n <= MY_THREADS_MAX; n++) {
            threads = recordThreadReply(threads, reply({ rootNo: String(n), at: n }), { root });
        }
        expect(recordThreadReply(threads, reply({ rootNo: 'old', at: 0 }), { root })).toBe(threads);
    });

    it('stamps no place on a Self Channel thread', () => {
        const threads = recordThreadReply({}, reply({ placeId: '@account' }), { root });
        expect(threads[myThreadKey('c1', 'ch1', '10')].placeId).toBeUndefined();
    });
});

describe('markThreadSeen', () => {
    it('clears the unread state', () => {
        const held = recordThreadReply({}, reply(), { root });
        const key = myThreadKey('c1', 'ch1', '10');
        expect(isThreadUnread(markThreadSeen(held, key)[key])).toBe(false);
    });

    it('returns the same object when there is nothing to mark', () => {
        const held = recordThreadReply({}, reply({ mine: true }), { root });
        expect(markThreadSeen(held, myThreadKey('c1', 'ch1', '10'))).toBe(held);
        expect(markThreadSeen(held, 'missing')).toBe(held);
    });
});

describe('threadChannel', () => {
    it("keeps a named channel's bare name and a DM's kind only", () => {
        expect(threadChannel({ id: 'a', name: '#general' } as DomainChannel)).toEqual({
            channelKind: 'channel',
            channelName: 'general',
        });
        expect(threadChannel({ id: 'b', name: 'x', stereo: 'dm' } as DomainChannel)).toEqual({ channelKind: 'dm' });
    });
});
