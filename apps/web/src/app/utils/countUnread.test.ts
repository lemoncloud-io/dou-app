import { countUnread, readCursorOf, readPositionOf, unreadOf } from './countUnread';

describe('countUnread', () => {
    it('converts both the head and the cursor to the user-message scale before comparing', () => {
        expect(countUnread({ headChatNo: 30, headMetaNo: 5, readNo: 20, readMetaNo: 3 })).toBe(8);
    });

    it("borrows the head's metaNo when the join row predates the snapshot", () => {
        expect(countUnread({ headChatNo: 30, headMetaNo: 5, readNo: 20 })).toBe(10);
    });

    it('overcounts a snapshot-less cursor by the system events above it, and says so', () => {
        expect(countUnread({ headChatNo: 40, headMetaNo: 8, readNo: 30 })).toBe(10);
        expect(countUnread({ headChatNo: 40, headMetaNo: 8, readNo: 30, readMetaNo: 5 })).toBe(7);
    });

    it('still reads non-zero as system events land after a snapshot-less read to the head', () => {
        expect(countUnread({ headChatNo: 30, headMetaNo: 5, readNo: 30 })).toBe(0);
        expect(countUnread({ headChatNo: 31, headMetaNo: 6, readNo: 30 })).toBe(1);
        expect(countUnread({ headChatNo: 32, headMetaNo: 7, readNo: 30 })).toBe(2);
        expect(countUnread({ headChatNo: 33, headMetaNo: 8, readNo: 30 })).toBe(3);
    });

    it('counts nothing when no read cursor is known yet', () => {
        expect(countUnread({ headChatNo: 30, headMetaNo: 0, readNo: undefined })).toBe(0);
    });

    it('never goes negative when the cursor is ahead of the cached head', () => {
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

describe('readPositionOf', () => {
    it('takes the embedded $join when it is further along — a read made on another device', () => {
        const join = { chatNo: 4, metaNo: 1 };
        const embedded = { chatNo: 9, metaNo: 2 };
        expect(readPositionOf(join, embedded)).toBe(embedded);
    });

    it('keeps the join row when it is further along — a read made here, before the next delta', () => {
        const join = { readNo: 9, metaNo: 2 };
        const embedded = { chatNo: 4, metaNo: 1 };
        expect(readPositionOf(join, embedded)).toBe(join);
    });

    it('answers with whichever one exists, and nothing when neither does', () => {
        const only = { chatNo: 3 };
        expect(readPositionOf(undefined, only)).toBe(only);
        expect(readPositionOf(only, undefined)).toBe(only);
        expect(readPositionOf(undefined, undefined)).toBeUndefined();
    });

    it('on a tie prefers the one carrying its own metaNo snapshot', () => {
        const join = { chatNo: 5 };
        const embedded = { chatNo: 5, metaNo: 2 };
        expect(readPositionOf(join, embedded)).toBe(embedded);
        const joinWithSnapshot = { chatNo: 5, metaNo: 1 };
        expect(readPositionOf(joinWithSnapshot, embedded)).toBe(joinWithSnapshot);
    });
});

describe('unreadOf', () => {
    it('counts against the position it picked, converted with that position own metaNo', () => {
        const channel = { chatNo: 30, metaNo: 5, $join: { chatNo: 20, metaNo: 3 } };
        expect(unreadOf(channel, { chatNo: 10, metaNo: 1 })).toBe(8);
    });

    it('counts from the embedded $join alone when no join row is cached — a cloud off screen', () => {
        expect(unreadOf({ chatNo: 12, metaNo: 0, $join: { chatNo: 9 } })).toBe(3);
    });

    it('counts nothing when neither cursor is known', () => {
        expect(unreadOf({ chatNo: 12, metaNo: 0 })).toBe(0);
    });
});
