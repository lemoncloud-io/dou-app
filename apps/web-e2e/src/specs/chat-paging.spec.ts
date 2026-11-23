import type { Page } from '@playwright/test';

import { SocketRefusal, type SentFrame } from '../fixtures/backend';
import { DM_CHANNEL, feedPage, historyLine, longDmRoom, MINA, roomsSocket } from '../fixtures/rooms';
import { composer, roomRow } from '../support/app';
import { expect, test } from '../support/test';

const HISTORY = 200;
const OLDER_PAGE = 50;

const messageList = (page: Page) => page.locator('div.flex-col-reverse.overflow-y-auto');

const shownChatNos = (page: Page): Promise<number[]> =>
    page.locator('[data-chat-no]').evaluateAll(rows => rows.map(row => Number(row.getAttribute('data-chat-no'))));

const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);

const shownSorted = async (page: Page): Promise<number[]> => (await shownChatNos(page)).sort((a, b) => a - b);

const scrollToTop = (page: Page, anchor?: number): Promise<number | null> =>
    messageList(page).evaluate((list, anchor) => {
        list.scrollTop = -(list.scrollHeight - list.clientHeight);
        const row = anchor === undefined ? null : document.querySelector(`[data-chat-no="${anchor}"]`);
        const offset = row ? row.getBoundingClientRect().top - list.getBoundingClientRect().top : null;
        list.dispatchEvent(new Event('scroll'));
        return offset;
    }, anchor);

const screensFromTop = (page: Page): Promise<number> =>
    messageList(page).evaluate(
        list => (list.scrollHeight - list.clientHeight - Math.abs(list.scrollTop)) / list.clientHeight
    );

const rowOffset = (page: Page, chatNo: number): Promise<number> =>
    page.evaluate(chatNo => {
        const row = document.querySelector(`[data-chat-no="${chatNo}"]`);
        const list = document.querySelector('div.flex-col-reverse.overflow-y-auto');
        if (!row || !list) throw new Error(`row ${chatNo} or the list is not in the DOM`);
        return row.getBoundingClientRect().top - list.getBoundingClientRect().top;
    }, chatNo);

const feedData = (frame: SentFrame) => (frame.data ?? {}) as { channelId?: string; cursorNo?: number; limit?: number };

const feedsForRoom = (backend: { sent(type: string): SentFrame[] }) =>
    backend.sent('chat.feed').filter(frame => feedData(frame).channelId === DM_CHANNEL.id);

const olderPageCursors = (backend: { sent(type: string): SentFrame[] }) =>
    feedsForRoom(backend)
        .map(frame => feedData(frame).cursorNo)
        .filter((cursorNo): cursorNo is number => !!cursorNo);

const openRoom = async (page: Page): Promise<number> => {
    await page.goto('/');
    await roomRow(page, MINA.nick).click();
    await expect(composer(page)).toBeVisible();
    await expect(page.getByText(historyLine(HISTORY), { exact: true })).toBeVisible();
    const shown = await shownSorted(page);
    expect(shown).toEqual(range(shown[0] as number, HISTORY));
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

    expect(feedsForRoom(backend).map(feedData)).toContainEqual({ channelId: DM_CHANNEL.id });
    expect(olderPageCursors(backend)).toEqual([]);

    const anchorBefore = await scrollToTop(page, oldest);
    await expect.poll(() => olderPageCursors(backend)).toEqual([oldest]);
    expect(feedData(feedsForRoom(backend).at(-1) as SentFrame)).toEqual({
        channelId: DM_CHANNEL.id,
        cursorNo: oldest,
        limit: OLDER_PAGE,
    });
    await expect.poll(() => shownSorted(page)).toEqual(range(oldest - OLDER_PAGE, HISTORY));
    expect(Math.abs((await rowOffset(page, oldest)) - (anchorBefore as number))).toBeLessThanOrEqual(1);

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
    test.slow();
    const room = longDmRoom(HISTORY);
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

    await scrollToTop(page);
    await expect.poll(() => olderAt.length).toBe(1);
    expect(await shownSorted(page)).toEqual(opened);
    await expect(page.getByText('Unable to load channel info', { exact: true })).toHaveCount(0);
    await expect(composer(page)).toBeEditable();

    await expect.poll(() => shownSorted(page), { timeout: 15_000 }).toEqual(range(oldest - OLDER_PAGE, HISTORY));
    expect(olderPageCursors(backend)).toEqual([oldest, oldest, oldest]);
    const [first, second, third] = olderAt as [number, number, number];
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
        'chat.feed': data => {
            const answer = () => feedPage(room.chats, data);
            return (data as { cursorNo?: number } | null)?.cursorNo ? held.then(answer) : answer();
        },
    });
    const oldest = await openRoom(page);
    const opened = await shownSorted(page);

    await scrollToTop(page);
    await expect.poll(() => olderPageCursors(backend)).toEqual([oldest]);

    await expect(messageList(page).locator('.animate-spin')).toBeVisible();
    for (let i = 0; i < 5; i++) await scrollToTop(page);
    expect(await shownSorted(page)).toEqual(opened);

    release();
    await expect.poll(() => shownSorted(page)).toEqual(range(oldest - OLDER_PAGE, HISTORY));
    await expect(messageList(page).locator('.animate-spin')).toHaveCount(0);
    expect(olderPageCursors(backend)).toEqual([oldest]);
});
