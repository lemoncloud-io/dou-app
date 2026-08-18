import { countUnread, readCursorOf } from './countUnread';

describe('countUnread', () => {
    it('converts both the head and the cursor to the user-message scale before comparing', () => {
        // Head 30 with 5 system events = 25 user messages. Cursor 20 with 3 system events by then
        // = 17 user messages read. Unread = 25 - 17 = 8.
        expect(countUnread({ headChatNo: 30, headMetaNo: 5, readNo: 20, readMetaNo: 3 })).toBe(8);
    });

    it('subtracts an unconvertible cursor as-is when the join row predates the snapshot', () => {
        // No readMetaNo, so the cursor stays on the unified scale: 25 user messages at the head
        // minus a cursor of 20 = 5. Undercounts by the join's real metaNo, which is the direction
        // to fail in — borrowing the head's metaNo (the old fallback) overcounted instead.
        expect(countUnread({ headChatNo: 30, headMetaNo: 5, readNo: 20 })).toBe(5);
    });

    it('stays at zero as system events arrive after a snapshot-less read (the badge that never went down)', () => {
        // Read to the head: 25 user messages, cursor 30, no join snapshot.
        expect(countUnread({ headChatNo: 30, headMetaNo: 5, readNo: 30 })).toBe(0);
        // Three reactions land. They move the head and the head's metaNo together, so the user
        // count is unchanged and the badge must stay empty — the old fallback showed 1, then 2,
        // then 3, and re-reading the room could not clear it.
        expect(countUnread({ headChatNo: 31, headMetaNo: 6, readNo: 30 })).toBe(0);
        expect(countUnread({ headChatNo: 32, headMetaNo: 7, readNo: 30 })).toBe(0);
        expect(countUnread({ headChatNo: 33, headMetaNo: 8, readNo: 30 })).toBe(0);
    });

    it('undercounts a snapshot-less cursor by the system events below it, and says so', () => {
        // The cost of the line above. Head 40 / metaNo 8 = 32 user messages against an unconverted
        // cursor of 30 reads as 2, where a cursor carrying its own snapshot (metaNo 5 at slot 30)
        // would read as 7. The row repairs itself the next time the room is read: the server
        // answers `join.read` with a cursor AND its snapshot, and the branch above stops applying.
        expect(countUnread({ headChatNo: 40, headMetaNo: 8, readNo: 30 })).toBe(2);
        expect(countUnread({ headChatNo: 40, headMetaNo: 8, readNo: 30, readMetaNo: 5 })).toBe(7);
    });

    it('counts nothing when no read cursor is known yet', () => {
        // A channel whose join row hasn't landed must not flash a full count.
        expect(countUnread({ headChatNo: 30, headMetaNo: 0, readNo: undefined })).toBe(0);
    });

    it('never goes negative when the cursor is ahead of the cached head', () => {
        // Routine for a search result: the cached head is as old as the last sync of that cloud.
        expect(countUnread({ headChatNo: 10, headMetaNo: 0, readNo: 40 })).toBe(0);
    });

    it('treats a missing head as zero', () => {
        expect(countUnread({ readNo: 0 })).toBe(0);
    });
});

describe('readCursorOf', () => {
    it('takes the freshest of readNo and chatNo', () => {
        expect(readCursorOf({ readNo: 3, chatNo: 9 })).toBe(9);
        expect(readCursorOf({ readNo: 9, chatNo: 3 })).toBe(9);
    });

    it('is undefined without a join row, which is what suppresses the badge', () => {
        expect(readCursorOf(undefined)).toBeUndefined();
    });
});
