import type { DomainChannel } from '@chatic/runtime';
import { describe, expect, it } from 'vitest';

import { channelReadNo, computeChannelUnread } from './channelUnread';

const MY_UID = 'U-me';

type ChannelFields = Omit<Partial<DomainChannel>, '$join' | 'lastChat$'> & {
    $join?: { chatNo?: number; joinedNo?: number; metaNo?: number; userId?: string };
    lastChat$?: { stereo?: string; subType?: string; ownerId?: string };
};

const channel = (fields: ChannelFields): DomainChannel => ({ id: 'ch-1', ...fields }) as DomainChannel;

describe('computeChannelUnread', () => {
    it('counts user messages past the read boundary', () => {
        const ch = channel({ chatNo: 10, metaNo: 0, $join: { chatNo: 7, metaNo: 0 } });
        expect(computeChannelUnread(ch, MY_UID)).toBe(3);
    });

    it('does not count a reaction — it advances chatNo and metaNo together', () => {
        const before = channel({ chatNo: 10, metaNo: 2, $join: { chatNo: 10, metaNo: 2 } });
        expect(computeChannelUnread(before, MY_UID)).toBe(0);

        const afterTwoReactions = channel({ chatNo: 12, metaNo: 4, $join: { chatNo: 10, metaNo: 2 } });
        expect(computeChannelUnread(afterTwoReactions, MY_UID)).toBe(0);
    });

    it('still counts a real message that arrives after a reaction', () => {
        const ch = channel({ chatNo: 12, metaNo: 3, $join: { chatNo: 10, metaNo: 2 } });
        expect(computeChannelUnread(ch, MY_UID)).toBe(1);
    });

    it('prefers whichever boundary has read further', () => {
        const ch = channel({ chatNo: 20, metaNo: 0, $join: { chatNo: 5, metaNo: 0 } });
        expect(computeChannelUnread(ch, MY_UID, undefined, { chatNo: 18, metaNo: 0 })).toBe(2);
    });

    it('degrades to the raw delta when the join row carries no metaNo snapshot', () => {
        const ch = channel({ chatNo: 12, metaNo: 4, $join: { chatNo: 10 } });
        expect(computeChannelUnread(ch, MY_UID)).toBe(2);
    });

    it('clears once this device has read up to the head', () => {
        const ch = channel({ chatNo: 12, metaNo: 0, $join: { chatNo: 3, metaNo: 0 } });
        expect(computeChannelUnread(ch, MY_UID, 12)).toBe(0);
    });

    it('caps the count at what this device has not read, while the server cursor lags', () => {
        const ch = channel({ chatNo: 51, metaNo: 0, $join: { chatNo: 30, metaNo: 0 } });
        expect(computeChannelUnread(ch, MY_UID, 50)).toBe(1);
    });

    it('caps the stale server count the same way', () => {
        const ch = channel({ chatNo: 51, metaNo: 0, unreadCount: 21 });
        expect(computeChannelUnread(ch, MY_UID, 50)).toBe(1);
    });

    it('keeps the metaNo snapshot when two boundaries sit at the same chatNo', () => {
        const ch = channel({ chatNo: 12, metaNo: 4, $join: { chatNo: 10, metaNo: 2 } });
        expect(computeChannelUnread(ch, MY_UID, undefined, { chatNo: 10 })).toBe(0);
    });

    it('clears when my own message is the latest', () => {
        const ch = channel({
            chatNo: 12,
            metaNo: 0,
            lastChat$: { stereo: 'user', ownerId: MY_UID },
            $join: { chatNo: 3, metaNo: 0 },
        });
        expect(computeChannelUnread(ch, MY_UID)).toBe(0);
    });

    it('clears when my own latest message is owned by my cloud user id', () => {
        const ch = channel({
            chatNo: 12,
            metaNo: 0,
            lastChat$: { stereo: 'user', ownerId: 'cloud-me' },
            $join: { chatNo: 3, metaNo: 0, userId: 'cloud-me' },
        });
        expect(computeChannelUnread(ch, MY_UID)).toBe(0);
    });

    it('does not clear when the latest message is a webhook carrying my id', () => {
        const ch = channel({
            chatNo: 12,
            metaNo: 0,
            lastChat$: { stereo: 'webhook', ownerId: MY_UID },
            $join: { chatNo: 3, metaNo: 0 },
        });
        expect(computeChannelUnread(ch, MY_UID)).toBe(9);
    });

    it('does not clear when the latest message is another member of the same cloud', () => {
        const ch = channel({
            chatNo: 12,
            metaNo: 0,
            lastChat$: { stereo: 'user', ownerId: 'cloud-other' },
            $join: { chatNo: 3, metaNo: 0, userId: 'cloud-me' },
        });
        expect(computeChannelUnread(ch, MY_UID)).toBe(9);
    });

    it('does not treat a cloud-owned latest message as mine without a $join', () => {
        const ch = channel({
            chatNo: 12,
            metaNo: 0,
            unreadCount: 4,
            lastChat$: { stereo: 'user', ownerId: 'cloud-me' },
        });
        expect(computeChannelUnread(ch, MY_UID)).toBe(4);
    });

    it('does not clear when my own reaction is the latest', () => {
        const ch = channel({
            chatNo: 12,
            metaNo: 1,
            lastChat$: { stereo: 'system', subType: 'reaction', ownerId: MY_UID },
            $join: { chatNo: 3, metaNo: 0 },
        });
        expect(computeChannelUnread(ch, MY_UID)).toBe(8);
    });

    it('counts from the join point on a channel joined but never read', () => {
        const ch = channel({ chatNo: 120, metaNo: 0, $join: { chatNo: 0, joinedNo: 100, metaNo: 0 } });
        expect(computeChannelUnread(ch, MY_UID)).toBe(20);
    });

    it('falls back to the server count while no boundary is known', () => {
        const ch = channel({ chatNo: 12, metaNo: 0, unreadCount: 4 });
        expect(computeChannelUnread(ch, MY_UID)).toBe(4);
    });

    it('keeps the server count when the cached row carries no head', () => {
        const ch = channel({ unreadCount: 4 });
        expect(computeChannelUnread(ch, MY_UID, 50)).toBe(4);
    });

    it('shows no badge when neither a boundary nor a server count exists', () => {
        expect(computeChannelUnread(channel({ chatNo: 12, metaNo: 0 }), MY_UID)).toBe(0);
    });
});

describe('channelReadNo', () => {
    it('reads this device cursor when it is further', () => {
        expect(channelReadNo(channel({ $join: { chatNo: 3 } }), 7)).toBe(7);
    });

    it('reads the channel record when it is further', () => {
        expect(channelReadNo(channel({ $join: { chatNo: 9 } }), 4)).toBe(9);
    });

    it('reads zero when neither has read anything', () => {
        expect(channelReadNo(channel({}), 0)).toBe(0);
    });
});
