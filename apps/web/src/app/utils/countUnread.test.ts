import { countUnread, readCursorOf } from './countUnread';

describe('countUnread', () => {
    it('nets out system messages before comparing against the cursor', () => {
        // Head 30 with 5 join/leave events = 25 user messages; 20 of them read.
        expect(countUnread({ headChatNo: 30, headMetaNo: 5, readNo: 20 })).toBe(5);
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
