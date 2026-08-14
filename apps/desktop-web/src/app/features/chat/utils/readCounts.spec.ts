import { describe, expect, it } from 'vitest';

import type { DomainJoin } from '@chatic/data';

import { activeMemberIdsOf, countReadsAt, readCursorsOf, readStateKeyOf } from './readCounts';

const join = (userId: string, chatNo: number, extra: Partial<DomainJoin> = {}): DomainJoin =>
    ({ id: `C1@${userId}`, channelId: 'C1', userId, joined: 1, readNo: 0, chatNo, ...extra }) as DomainJoin;

describe('readCursorsOf', () => {
    // readChat patches `readNo` optimistically while the server answer still carries the
    // older `chatNo`, so the cursor is whichever is further along.
    it('takes a member at the further of readNo and chatNo', () => {
        const cursors = readCursorsOf([join('ada', 4, { readNo: 7 }), join('bob', 9, { readNo: 0 })]);

        expect(cursors.get('ada')).toBe(7);
        expect(cursors.get('bob')).toBe(9);
    });
});

describe('readStateKeyOf', () => {
    // The join cache re-emits every row on any write. Keying the derivation on the array
    // identity would rebuild the receipt callback — and re-render every message row — for a
    // notification-mode toggle no receipt can see.
    it('ignores fields the receipt never reads', () => {
        const before = readStateKeyOf([join('ada', 5), join('bob', 3)]);
        const muted = { ...join('ada', 5), notifyMode: 'mute' } as DomainJoin;

        expect(readStateKeyOf([muted, join('bob', 3)])).toBe(before);
    });

    it('changes when a member reads further', () => {
        expect(readStateKeyOf([join('ada', 6)])).not.toBe(readStateKeyOf([join('ada', 5)]));
    });
});

describe('activeMemberIdsOf', () => {
    // The join cache keeps a departed member's row (observeList returns it unless
    // `activeOnly` is asked for), and counting it would leave the channel permanently
    // one member short of "everyone read this".
    it('leaves out members who have left the channel', () => {
        const active = activeMemberIdsOf([join('ada', 5), join('gone', 2, { joined: 0 }), join('bob', 5)]);

        expect(active).toEqual(['ada', 'bob']);
    });
});

describe('countReadsAt', () => {
    it('counts a member as read once their cursor reaches the message', () => {
        const cursors = readCursorsOf([join('ada', 5), join('bob', 3)]);

        expect(countReadsAt(5, ['ada', 'bob'], cursors)).toEqual({ readCount: 1, unreadCount: 1 });
        expect(countReadsAt(3, ['ada', 'bob'], cursors)).toEqual({ readCount: 2, unreadCount: 0 });
    });

    // A member whose join row has not synced yet is behind until it lands — claiming they
    // read it would be the one error a receipt must not make.
    it('counts a member with no join row yet as unread', () => {
        const cursors = readCursorsOf([join('ada', 5)]);

        expect(countReadsAt(5, ['ada', 'nosync'], cursors)).toEqual({ readCount: 1, unreadCount: 1 });
    });

    // Nobody is unread on their own message. The cursor cannot be trusted to say so: the
    // server does not advance it on send, and this client only reports a read while the
    // window is focused — so a message sent from a blurred window read "Unread 1", the 1
    // being its author.
    it('counts the sender as read even when their cursor lags', () => {
        const cursors = readCursorsOf([join('ada', 2), join('bob', 9)]);

        expect(countReadsAt(5, ['ada', 'bob'], cursors, 'ada')).toEqual({ readCount: 2, unreadCount: 0 });
    });

    it('holds unread at zero once everyone is past the message', () => {
        const cursors = readCursorsOf([join('ada', 9), join('bob', 9)]);

        expect(countReadsAt(3, ['ada', 'bob'], cursors)).toEqual({ readCount: 2, unreadCount: 0 });
    });
});
