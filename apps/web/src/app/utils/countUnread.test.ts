import { countUnread, readCursorOf } from './countUnread';

describe('countUnread', () => {
    it('converts both the head and the cursor to the user-message scale before comparing', () => {
        // Head 30 with 5 system events = 25 user messages. Cursor 20 with 3 system events by then
        // = 17 user messages read. Unread = 25 - 17 = 8.
        expect(countUnread({ headChatNo: 30, headMetaNo: 5, readNo: 20, readMetaNo: 3 })).toBe(8);
    });

    it("borrows the head's metaNo when the join row predates the snapshot", () => {
        // No readMetaNo, so headMetaNo stands in for it (ADR-0048 fallback, same as the server's
        // calcUnreadCount): 25 user messages at the head minus a cursor converted as 20 - 5 = 15,
        // so 10. Compare the exact form on the line above, where the cursor's own snapshot of 3
        // gives 8 — the fallback reads HIGH by whatever system events sit between cursor and head.
        expect(countUnread({ headChatNo: 30, headMetaNo: 5, readNo: 20 })).toBe(10);
    });

    it('overcounts a snapshot-less cursor by the system events above it, and says so', () => {
        // The cost of the fallback, stated plainly. Head 40 / metaNo 8 = 32 user messages against a
        // cursor of 30 converted with the HEAD's metaNo (30 - 8 = 22) reads as 10, where the cursor
        // carrying its own snapshot (metaNo 5 at slot 30) reads as the true 7. The row repairs
        // itself the next time the room is read: the server answers `join.read` with a cursor AND
        // its snapshot, and this branch stops applying.
        expect(countUnread({ headChatNo: 40, headMetaNo: 8, readNo: 30 })).toBe(10);
        expect(countUnread({ headChatNo: 40, headMetaNo: 8, readNo: 30, readMetaNo: 5 })).toBe(7);
    });

    // Worth keeping visible: this is the shape the fallback gets WRONG, and the reason the
    // alternative (subtracting the cursor unconverted) was tried. A room read to the head still
    // shows a badge that climbs with each reaction, until the next read fills in join.metaNo.
    it('still reads non-zero as system events land after a snapshot-less read to the head', () => {
        // Read to the head. Cursor 30 converted with headMetaNo 5 = 25, head user count 25 → 0.
        expect(countUnread({ headChatNo: 30, headMetaNo: 5, readNo: 30 })).toBe(0);
        // Three reactions. Head and headMetaNo move together so the user count stays 25, but the
        // cursor is re-converted with the NEW headMetaNo each time, so the badge drifts up.
        expect(countUnread({ headChatNo: 31, headMetaNo: 6, readNo: 30 })).toBe(1);
        expect(countUnread({ headChatNo: 32, headMetaNo: 7, readNo: 30 })).toBe(2);
        expect(countUnread({ headChatNo: 33, headMetaNo: 8, readNo: 30 })).toBe(3);
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
