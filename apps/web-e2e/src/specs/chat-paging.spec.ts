import type { Page } from '@playwright/test';

import { SocketRefusal, type SentFrame } from '../fixtures/backend';
import { DM_CHANNEL, feedPage, historyLine, longDmRoom, MINA, roomsSocket } from '../fixtures/rooms';
import { composer, roomRow } from '../support/app';
import { expect, test } from '../support/test';

/**
 * Paging a room's history (apps/web/docs/feature/channels/data-layer.md § Paging widens the window,
 * and apps/web/docs/feature/channels/chat-room.md § Scrolling). The room opens on its newest messages — home's catch-up has already cached a
 * few, and entering asks the relay for the newest page again (`chat.feed`, no cursor). Each older
 * page is another `chat.feed` whose `cursorNo` is the oldest message on screen, 50 at a time, asked
 * for once the reader is within two screens of the top. The list scrolls in a reversed column, so a
 * page added above leaves what the reader is looking at where it was. An older page that fails is
 * not the room failing: the conversation stays, and the page is asked for again after a growing wait.
 *
 * Mina's 1:1 holds 200 messages here, and what the room opens with is more than two screens of them,
 * so every older page in these scenarios is one the reader scrolled for.
 *
 * Nothing here waits on a frame being drawn or a scroll event the browser fires on its own: the
 * scroll is set and its event dispatched by the scenario, and what is asserted is the requests and
 * the rows in the DOM.
 */

const HISTORY = 200;
const OLDER_PAGE = 50;

/** The room's message list — the one scrolling column; the date groups inside it do not scroll. */
const messageList = (page: Page) => page.locator('div.flex-col-reverse.overflow-y-auto');

/** The chat numbers of the message rows in the DOM, in DOM order. The list is not virtualized. */
const shownChatNos = (page: Page): Promise<number[]> =>
    page.locator('[data-chat-no]').evaluateAll(rows => rows.map(row => Number(row.getAttribute('data-chat-no'))));

/** `from..to`, every number once. */
const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** The rows on screen, sorted: a duplicate or a gap shows as a difference from a `range`. */
const shownSorted = async (page: Page): Promise<number[]> => (await shownChatNos(page)).sort((a, b) => a - b);

/**
 * The reader scrolls to the top of what is loaded. The scroll event is dispatched, not waited for.
 * Returns where row `anchor` then sits (`rowOffset`), measured in the same turn as the scroll and
 * before its event — before the page can have asked for anything, let alone had it land.
 */
const scrollToTop = (page: Page, anchor?: number): Promise<number | null> =>
    messageList(page).evaluate((list, anchor) => {
        // A reversed column: 0 is the bottom, and the top is the most negative offset.
        list.scrollTop = -(list.scrollHeight - list.clientHeight);
        const row = anchor === undefined ? null : document.querySelector(`[data-chat-no="${anchor}"]`);
        const offset = row ? row.getBoundingClientRect().top - list.getBoundingClientRect().top : null;
        list.dispatchEvent(new Event('scroll'));
        return offset;
    }, anchor);

/**
 * How far the reader is from the top, in screens — the measure the room asks for an older page by
 * (within two screens of the top, it asks).
 */
const screensFromTop = (page: Page): Promise<number> =>
    messageList(page).evaluate(
        list => (list.scrollHeight - list.clientHeight - Math.abs(list.scrollTop)) / list.clientHeight
    );

/** Where a message row sits on screen, relative to the list — what the reader sees move or not. */
const rowOffset = (page: Page, chatNo: number): Promise<number> =>
    page.evaluate(chatNo => {
        const row = document.querySelector(`[data-chat-no="${chatNo}"]`);
        const list = document.querySelector('div.flex-col-reverse.overflow-y-auto');
        if (!row || !list) throw new Error(`row ${chatNo} or the list is not in the DOM`);
        return row.getBoundingClientRect().top - list.getBoundingClientRect().top;
    }, chatNo);

const feedData = (frame: SentFrame) => (frame.data ?? {}) as { channelId?: string; cursorNo?: number; limit?: number };

/** The room's own `chat.feed` requests, oldest first: the entry page, then each older page. */
const feedsForRoom = (backend: { sent(type: string): SentFrame[] }) =>
    backend.sent('chat.feed').filter(frame => feedData(frame).channelId === DM_CHANNEL.id);

/** The older-page requests: the ones with a cursor. */
const olderPageCursors = (backend: { sent(type: string): SentFrame[] }) =>
    feedsForRoom(backend)
        .map(frame => feedData(frame).cursorNo)
        .filter((cursorNo): cursorNo is number => !!cursorNo);

/**
 * Into Mina's 1:1, and until the room has its newest messages on screen. Returns the oldest of them —
 * the cursor the first older page must be asked below.
 */
const openRoom = async (page: Page): Promise<number> => {
    await page.goto('/');
    await roomRow(page, MINA.nick).click();
    await expect(composer(page)).toBeVisible();
    await expect(page.getByText(historyLine(HISTORY), { exact: true })).toBeVisible();
    const shown = await shownSorted(page);
    // The newest messages, every one once, ending at the newest.
    expect(shown).toEqual(range(shown[0] as number, HISTORY));
    // More than two screens of them: from here, only the reader scrolling up asks for more. (Were this
    // not so, a request after the scroll would prove nothing about scrolling.)
    expect(await screensFromTop(page)).toBeGreaterThan(2);
    return shown[0] as number;
};

test('entering a room shows its newest page; scrolling up brings each older page once, in place', async ({
    page,
    backend,
}) => {
    const room = longDmRoom(HISTORY);
    backend.useSocket(roomsSocket(backend, [room]));
    let oldest = await openRoom(page);

    // The room asked for its newest page, and nothing older yet.
    expect(feedsForRoom(backend).map(feedData)).toContainEqual({ channelId: DM_CHANNEL.id });
    expect(olderPageCursors(backend)).toEqual([]);

    // Up to the top: the next page is asked for below the oldest row on screen, and that row stays
    // where the reader saw it while fifty rows land above it.
    const anchorBefore = await scrollToTop(page, oldest);
    await expect.poll(() => olderPageCursors(backend)).toEqual([oldest]);
    expect(feedData(feedsForRoom(backend).at(-1) as SentFrame)).toEqual({
        channelId: DM_CHANNEL.id,
        cursorNo: oldest,
        limit: OLDER_PAGE,
    });
    await expect.poll(() => shownSorted(page)).toEqual(range(oldest - OLDER_PAGE, HISTORY));
    expect(Math.abs((await rowOffset(page, oldest)) - (anchorBefore as number))).toBeLessThanOrEqual(1);

    // On to the start of the room: each page below the last, every message once and none missing,
    // the row being read held in place each time, and the room's opening line above message 1.
    const cursors = [oldest];
    oldest -= OLDER_PAGE;
    while (oldest > 1) {
        const anchor = oldest;
        const anchorAt = (await scrollToTop(page, anchor)) as number;
        cursors.push(oldest);
        await expect.poll(() => olderPageCursors(backend)).toEqual(cursors);
        oldest = Math.max(1, oldest - OLDER_PAGE);
        await expect.poll(() => shownSorted(page)).toEqual(range(oldest, HISTORY));
        expect(Math.abs((await rowOffset(page, anchor)) - anchorAt)).toBeLessThanOrEqual(1);
    }
    await expect(page.getByText('Start a 1:1 conversation.', { exact: true })).toBeVisible();
});

test('an older page the relay refuses leaves the room as it was, and is asked for again after a wait', async ({
    page,
    backend,
}) => {
    // Six seconds of the page's own waiting on top of a boot.
    test.slow();
    const room = longDmRoom(HISTORY);
    /** When each older-page request arrived, in ms; the first two are refused. */
    const olderAt: number[] = [];
    backend.useSocket({
        ...roomsSocket(backend, [room]),
        'chat.feed': data => {
            if ((data as { cursorNo?: number } | null)?.cursorNo) {
                olderAt.push(Date.now());
                if (olderAt.length <= 2) throw new SocketRefusal('500 INTERNAL SERVER ERROR - feed unavailable');
            }
            return feedPage(room.chats, data);
        },
    });
    const oldest = await openRoom(page);
    const opened = await shownSorted(page);

    // The reader scrolls up and the older page is refused: what was on screen stays, whole, and the
    // room itself does not fail.
    await scrollToTop(page);
    await expect.poll(() => olderAt.length).toBe(1);
    expect(await shownSorted(page)).toEqual(opened);
    await expect(page.getByText('Unable to load channel info', { exact: true })).toHaveCount(0);
    await expect(composer(page)).toBeEditable();

    // With the reader still at the top, it is asked for again, twice, each after a longer wait (2s,
    // then 4s) — not in a loop — and the third answer lands the page with nothing duplicated and
    // nothing missing.
    await expect.poll(() => shownSorted(page), { timeout: 15_000 }).toEqual(range(oldest - OLDER_PAGE, HISTORY));
    expect(olderPageCursors(backend)).toEqual([oldest, oldest, oldest]);
    const [first, second, third] = olderAt as [number, number, number];
    // Lower bounds only: a slow machine stretches a wait, it cannot shorten one.
    expect(second - first).toBeGreaterThanOrEqual(1_800);
    expect(third - second).toBeGreaterThanOrEqual(3_600);
});

test('an older page the relay is slow to answer is asked for once, however often the reader scrolls', async ({
    page,
    backend,
}) => {
    const room = longDmRoom(HISTORY);
    let release: () => void = () => undefined;
    const held = new Promise<void>(resolve => (release = resolve));
    backend.useSocket({
        ...roomsSocket(backend, [room]),
        // An older page waits on the scenario; every other read is answered at once.
        'chat.feed': data => {
            const answer = () => feedPage(room.chats, data);
            return (data as { cursorNo?: number } | null)?.cursorNo ? held.then(answer) : answer();
        },
    });
    const oldest = await openRoom(page);
    const opened = await shownSorted(page);

    await scrollToTop(page);
    await expect.poll(() => olderPageCursors(backend)).toEqual([oldest]);

    // While it is out, the reader keeps scrolling to the top: the room shows it is loading, asks for
    // nothing more, and keeps the messages it has.
    await expect(messageList(page).locator('.animate-spin')).toBeVisible();
    for (let i = 0; i < 5; i++) await scrollToTop(page);
    expect(await shownSorted(page)).toEqual(opened);

    // The answer arrives (well inside the socket's own 30s timeout) and lands once. Only now is the
    // count read: had the scrolls above sent a second request, it went out before this answer did.
    release();
    await expect.poll(() => shownSorted(page)).toEqual(range(oldest - OLDER_PAGE, HISTORY));
    await expect(messageList(page).locator('.animate-spin')).toHaveCount(0);
    expect(olderPageCursors(backend)).toEqual([oldest]);
});
