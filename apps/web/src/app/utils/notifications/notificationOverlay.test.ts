import type { NotificationItem } from './notificationModel';
import {
    EMPTY_OVERLAY,
    applyOverlay,
    freshOverlay,
    markReadIn,
    markThreadReadIn,
    markUnreadIn,
    pruneOverlay,
    removeIn,
    restoreIn,
    type NotificationItems,
    type NotificationOverlay,
} from './notificationOverlay';

const item = (id: string, fields: Partial<NotificationItem> = {}): NotificationItem => ({
    id,
    cloudId: 'c1',
    placeId: 'p1',
    channelId: 'ch-1',
    chatNo: 10,
    kind: 'mention',
    ownerName: 'Minsu',
    content: 'hi',
    createdAt: 1_000,
    read: false,
    ...fields,
});

const byId = (...items: NotificationItem[]): NotificationItems => Object.fromEntries(items.map(i => [i.id, i]));

const overlayOf = (fields: Partial<NotificationOverlay>): NotificationOverlay => ({ ...EMPTY_OVERLAY, ...fields });

const ALL = 0;

describe('applyOverlay', () => {
    it('hands back items untouched when the overlay is empty', () => {
        const a = item('a');

        expect(applyOverlay(byId(a), EMPTY_OVERLAY, ALL).a).toBe(a);
    });

    it('leaves deleted items out and reads items marked read', () => {
        const overlay = overlayOf({
            entries: { a: { state: 'deleted', at: 1_000 }, b: { state: 'read', at: 1_000 } },
        });

        const items = applyOverlay(byId(item('a'), item('b')), overlay, ALL);

        expect(items.a).toBeUndefined();
        expect(items.b.read).toBe(true);
    });

    it('reads a thread item once its thread has been read past it, and only then', () => {
        const overlay = overlayOf({ threads: { 'c1:ch-1:7': { no: 20, at: 1_000 } } });

        const items = applyOverlay(
            byId(item('a', { parentId: '7', chatNo: 20 }), item('b', { parentId: '7', chatNo: 21 })),
            overlay,
            ALL
        );

        expect(items.a.read).toBe(true);
        expect(items.b.read).toBe(false);
    });

    it('reads a thread item sent before the overlay began, and only a thread item', () => {
        const overlay = freshOverlay(5_000);

        const items = applyOverlay(
            byId(
                item('old-reply', { parentId: '7', createdAt: 4_000 }),
                item('new-reply', { parentId: '7', createdAt: 6_000 }),
                item('old-top', { createdAt: 4_000 })
            ),
            overlay,
            ALL
        );

        expect(items['old-reply'].read).toBe(true);
        expect(items['new-reply'].read).toBe(false);
        expect(items['old-top'].read).toBe(false);
    });

    it('leaves out items sent before the window, though their room has not been worked out again', () => {
        const items = applyOverlay(
            byId(item('old', { createdAt: 100 }), item('new', { createdAt: 900 })),
            EMPTY_OVERLAY,
            500
        );

        expect(Object.keys(items)).toEqual(['new']);
    });

    it('does not apply what was done to an earlier event of a reaction given again', () => {
        const overlay = overlayOf({
            entries: {
                given: { state: 'deleted', at: 1_000, no: 4 },
                regiven: { state: 'deleted', at: 1_000, no: 4 },
            },
        });

        const items = applyOverlay(
            byId(item('given', { kind: 'reaction', chatNo: 4 }), item('regiven', { kind: 'reaction', chatNo: 9 })),
            overlay,
            ALL
        );

        expect(items.given).toBeUndefined();
        expect(items.regiven).toBeDefined();
    });

    it('keeps an item the rows already call read as read', () => {
        expect(applyOverlay(byId(item('a', { read: true })), EMPTY_OVERLAY, ALL).a.read).toBe(true);
    });
});

describe('markReadIn / markUnreadIn', () => {
    it('marks only the shown unread items, with their event number, and reports them', () => {
        const items = byId(item('a'), item('b', { read: true }));

        const { overlay, changed } = markReadIn(EMPTY_OVERLAY, items, ['a', 'b', 'gone']);

        expect(changed).toEqual(['a']);
        expect(overlay.entries).toEqual({ a: { state: 'read', at: 1_000, no: 10 } });
    });

    it('hands back the same overlay when nothing changes', () => {
        const { overlay } = markReadIn(EMPTY_OVERLAY, byId(item('a', { read: true })), ['a']);

        expect(overlay).toBe(EMPTY_OVERLAY);
    });

    it('undoes a mark by going back to what the rules say', () => {
        const { overlay } = markReadIn(EMPTY_OVERLAY, byId(item('a')), ['a']);

        expect(markUnreadIn(overlay, ['a'])).toEqual(EMPTY_OVERLAY);
        expect(markUnreadIn(EMPTY_OVERLAY, ['a'])).toBe(EMPTY_OVERLAY);
    });
});

describe('removeIn / restoreIn', () => {
    it('deletes the shown items and reports them', () => {
        const a = item('a');

        const { overlay, changed } = removeIn(EMPTY_OVERLAY, byId(a), ['a', 'gone']);

        expect(changed).toEqual([a]);
        expect(applyOverlay(byId(a), overlay, ALL).a).toBeUndefined();
    });

    it('restores an item as it was, read by hand when it had been', () => {
        const a = item('a');
        const b = item('b');
        const read = markReadIn(EMPTY_OVERLAY, byId(a, b), ['a']).overlay;
        const removed = removeIn(read, applyOverlay(byId(a, b), read, ALL), ['a', 'b']);

        const restored = restoreIn(removed.overlay, removed.changed);

        expect(restored.entries).toEqual({ a: { state: 'read', at: 1_000, no: 10 } });
    });

    it('hands back the same overlay when there is nothing to restore', () => {
        expect(restoreIn(EMPTY_OVERLAY, [item('a')])).toBe(EMPTY_OVERLAY);
    });
});

describe('markThreadReadIn', () => {
    it("reads a thread up to the highest number the inbox holds for it, and not another thread's", () => {
        const items = byId(
            item('a', { parentId: '7', chatNo: 20, createdAt: 2_000 }),
            item('b', { parentId: '7', chatNo: 25, createdAt: 3_000 }),
            item('c', { parentId: '8', chatNo: 30 })
        );

        const overlay = markThreadReadIn(EMPTY_OVERLAY, items, 'c1', 'ch-1', '7');

        expect(overlay.threads).toEqual({ 'c1:ch-1:7': { no: 25, at: 3_000 } });
    });

    it('never moves a thread back, and changes nothing for a thread it holds no items of', () => {
        const ahead = overlayOf({ threads: { 'c1:ch-1:7': { no: 40, at: 1_000 } } });
        const items = byId(item('a', { parentId: '7', chatNo: 20 }));

        expect(markThreadReadIn(ahead, items, 'c1', 'ch-1', '7')).toBe(ahead);
        expect(markThreadReadIn(EMPTY_OVERLAY, items, 'c1', 'ch-1', '9')).toBe(EMPTY_OVERLAY);
    });
});

describe('pruneOverlay', () => {
    it('drops what was done to items sent before the cutoff, and keeps the rest and the baseline', () => {
        const overlay: NotificationOverlay = {
            entries: { old: { state: 'deleted', at: 100 }, fresh: { state: 'read', at: 900 } },
            threads: { 'c1:ch-1:7': { no: 5, at: 100 }, 'c1:ch-1:8': { no: 6, at: 900 } },
            baselineAt: 50,
        };

        expect(pruneOverlay(overlay, 500)).toEqual({
            entries: { fresh: { state: 'read', at: 900 } },
            threads: { 'c1:ch-1:8': { no: 6, at: 900 } },
            baselineAt: 50,
        });
    });

    it('hands back the same overlay when nothing is stale', () => {
        const overlay = overlayOf({ entries: { a: { state: 'read', at: 900 } } });

        expect(pruneOverlay(overlay, 500)).toBe(overlay);
    });
});
