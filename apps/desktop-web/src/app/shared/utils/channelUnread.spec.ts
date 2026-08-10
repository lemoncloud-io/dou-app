import type { DomainChannel } from '@chatic/data';
import { describe, expect, it } from 'vitest';

import { computeChannelUnread } from './channelUnread';

const MY_UID = 'U-me';

const channel = (fields: Partial<DomainChannel>): DomainChannel => ({ id: 'ch-1', ...fields }) as DomainChannel;

describe('computeChannelUnread', () => {
    it('counts user messages past the read boundary', () => {
        const ch = channel({ chatNo: 10, metaNo: 0, $join: { chatNo: 7, metaNo: 0 } as never });
        expect(computeChannelUnread(ch, MY_UID, undefined)).toBe(3);
    });

    // The bug this file was written for: a reaction is a system chat that takes a `chatNo`
    // slot, so the raw head-minus-cursor delta showed a badge on a channel with nothing to read.
    it('does not count a reaction — it advances chatNo and metaNo together', () => {
        const before = channel({ chatNo: 10, metaNo: 2, $join: { chatNo: 10, metaNo: 2 } as never });
        expect(computeChannelUnread(before, MY_UID, undefined)).toBe(0);

        const afterTwoReactions = channel({ chatNo: 12, metaNo: 4, $join: { chatNo: 10, metaNo: 2 } as never });
        expect(computeChannelUnread(afterTwoReactions, MY_UID, undefined)).toBe(0);
    });

    it('still counts a real message that arrives after a reaction', () => {
        const ch = channel({ chatNo: 12, metaNo: 3, $join: { chatNo: 10, metaNo: 2 } as never });
        expect(computeChannelUnread(ch, MY_UID, undefined)).toBe(1);
    });

    it('prefers whichever boundary has read further', () => {
        const ch = channel({ chatNo: 20, metaNo: 0, $join: { chatNo: 5, metaNo: 0 } as never });
        expect(computeChannelUnread(ch, MY_UID, { chatNo: 18, metaNo: 0 })).toBe(2);
    });

    it('degrades to the raw delta when the join row carries no metaNo snapshot', () => {
        const ch = channel({ chatNo: 12, metaNo: 4, $join: { chatNo: 10 } as never });
        expect(computeChannelUnread(ch, MY_UID, undefined)).toBe(2);
    });

    it('clears once this device has read up to the head', () => {
        const ch = channel({ chatNo: 12, metaNo: 0, $join: { chatNo: 3, metaNo: 0 } as never });
        expect(computeChannelUnread(ch, MY_UID, undefined, 12)).toBe(0);
    });

    // The local cursor is why reading a channel clears the badge before the receipt round-trips.
    // A message arriving right after that read must count as one, not as the whole backlog the
    // lagging server cursor still implies.
    it('caps the count at what this device has not read, while the server cursor lags', () => {
        const ch = channel({ chatNo: 51, metaNo: 0, $join: { chatNo: 30, metaNo: 0 } as never });
        expect(computeChannelUnread(ch, MY_UID, undefined, 50)).toBe(1);
    });

    it('caps the stale server count the same way', () => {
        const ch = channel({ chatNo: 51, metaNo: 0, unreadCount: 21 });
        expect(computeChannelUnread(ch, MY_UID, undefined, 50)).toBe(1);
    });

    // The join cache row and the channel's inline `$join` are separate records: the same cursor
    // can arrive with the metaNo snapshot on one and without it on the other.
    it('keeps the metaNo snapshot when two boundaries sit at the same chatNo', () => {
        const ch = channel({ chatNo: 12, metaNo: 4, $join: { chatNo: 10, metaNo: 2 } as never });
        expect(computeChannelUnread(ch, MY_UID, { chatNo: 10 })).toBe(0);
    });

    it('clears when my own message is the latest', () => {
        const ch = channel({
            chatNo: 12,
            metaNo: 0,
            lastChat$: { stereo: 'user', ownerId: MY_UID } as never,
            $join: { chatNo: 3, metaNo: 0 } as never,
        });
        expect(computeChannelUnread(ch, MY_UID, undefined)).toBe(0);
    });

    // My reaction is the head too, but reacting is not reading — the messages below it are
    // still unread.
    it('does not clear when my own reaction is the latest', () => {
        const ch = channel({
            chatNo: 12,
            metaNo: 1,
            lastChat$: { stereo: 'system', subType: 'reaction', ownerId: MY_UID } as never,
            $join: { chatNo: 3, metaNo: 0 } as never,
        });
        expect(computeChannelUnread(ch, MY_UID, undefined)).toBe(8);
    });

    it('falls back to the server count while no boundary is known', () => {
        const ch = channel({ chatNo: 12, metaNo: 0, unreadCount: 4 });
        expect(computeChannelUnread(ch, MY_UID, undefined)).toBe(4);
    });

    it('shows no badge when neither a boundary nor a server count exists', () => {
        expect(computeChannelUnread(channel({ chatNo: 12, metaNo: 0 }), MY_UID, undefined)).toBe(0);
    });
});
