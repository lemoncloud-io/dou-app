import { countUnread, readCursorOf } from './countUnread';

describe('countUnread', () => {
    it('converts both the head and the cursor to the user-message scale before comparing', () => {
        // Head 30 with 5 system events = 25 user messages. Cursor 20 with 3 system events by then
        // = 17 user messages read. Unread = 25 - 17 = 8.
        expect(countUnread({ headChatNo: 30, headMetaNo: 5, readNo: 20, readMetaNo: 3 })).toBe(8);
    });

    it('falls back the cursor metaNo to the head metaNo when the join row predates the snapshot (ADR-0048)', () => {
        // No readMetaNo: cursor is netted against the head's own metaNo (5), not left unified-scale.
        expect(countUnread({ headChatNo: 30, headMetaNo: 5, readNo: 20 })).toBe(10);
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
