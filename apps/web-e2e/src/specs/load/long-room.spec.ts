import type { Page } from '@playwright/test';

import { DM_CHANNEL, historyLine, longDmRoom, MINA, roomsSocket } from '../../fixtures/rooms';
import { roomRow } from '../../support/app';
import { HEAP_NOTE, heapMB, msOf, msUntilVisible } from '../../support/load';
import { expect, test } from '../../support/test';

const HISTORY = 5_000;
const PAGES = 10;

const messageList = (page: Page) => page.locator('div.flex-col-reverse.overflow-y-auto');
const oldestShown = (page: Page): Promise<number> =>
    page
        .locator('[data-chat-no]')
        .evaluateAll(rows => Math.min(...rows.map(row => Number(row.getAttribute('data-chat-no')))));
const scrollToTop = (page: Page) =>
    messageList(page).evaluate(list => {
        list.scrollTop = -(list.scrollHeight - list.clientHeight);
        list.dispatchEvent(new Event('scroll'));
    });

test(
    `a room with ${HISTORY} messages opens on the newest, and pages back ${PAGES} times`,
    { tag: '@load' },
    async ({ page, backend, evidence }) => {
        test.setTimeout(120_000);
        backend.useSocket(roomsSocket(backend, [longDmRoom(HISTORY)]));
        await page.goto('/');
        await roomRow(page, MINA.nick).waitFor();
        const heapBefore = await heapMB(page);

        evidence.metric(
            'enter → newest message',
            await msOf(async () => {
                await roomRow(page, MINA.nick).click();
                await msUntilVisible(page.getByText(historyLine(HISTORY), { exact: true }));
            }),
            'ms'
        );
        await evidence.shot(`${HISTORY} messages: the newest on screen`);

        const firstOldest = await oldestShown(page);
        const pageTimes: number[] = [];
        for (let i = 0; i < PAGES; i += 1) {
            const before = await oldestShown(page);
            pageTimes.push(
                await msOf(async () => {
                    await scrollToTop(page);
                    await expect.poll(() => oldestShown(page), { timeout: 15_000 }).toBeLessThan(before);
                })
            );
        }
        const sorted = [...pageTimes].sort((a, b) => a - b);
        evidence.metric('older page: median', sorted[Math.floor(sorted.length / 2)], 'ms');
        evidence.metric('older page: slowest', sorted[sorted.length - 1], 'ms');
        const shown = (
            await page
                .locator('[data-chat-no]')
                .evaluateAll(rows => rows.map(r => Number(r.getAttribute('data-chat-no'))))
        ).sort((a, b) => a - b);
        const oldest = shown[0] ?? HISTORY;
        evidence.metric('messages in the DOM', shown.length, 'count');
        const heapAfter = await heapMB(page);
        evidence.metric('heap after paging', heapAfter, 'MB', HEAP_NOTE);
        evidence.metric(
            'heap growth from entering and paging',
            heapBefore === null || heapAfter === null ? null : heapAfter - heapBefore,
            'MB',
            HEAP_NOTE
        );
        await evidence.shot(`${HISTORY} messages: after ${PAGES} older pages`);

        expect(oldest).toBeLessThanOrEqual(firstOldest - PAGES * 50);
        expect(shown).toEqual(Array.from({ length: HISTORY - oldest + 1 }, (_, i) => oldest + i));
        expect(
            backend.sent('chat.feed').filter(f => (f.data as { channelId?: string }).channelId === DM_CHANNEL.id).length
        ).toBeGreaterThanOrEqual(PAGES);
    }
);
