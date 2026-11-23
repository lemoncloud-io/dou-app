import { loadRoomTitle, manyRooms } from '../../fixtures/load';
import { roomsSocket } from '../../fixtures/rooms';
import { roomRow } from '../../support/app';
import { HEAP_NOTE, heapMB, msOf, msUntilVisible, requestsDuring, scrollUntilVisible } from '../../support/load';
import { expect, test } from '../../support/test';

const ROOMS = 200;
const AFTER_PAINT_WINDOW = 10_000;

test(
    `home with ${ROOMS} rooms draws, and scrolls to the last one`,
    { tag: '@load' },
    async ({ page, backend, evidence }) => {
        test.setTimeout(120_000);
        backend.useSocket(roomsSocket(backend, manyRooms(ROOMS)));

        const started = performance.now();
        await page.goto('/');
        await roomRow(page, loadRoomTitle(ROOMS)).waitFor({ state: 'visible', timeout: 60_000 });
        evidence.metric('boot → first room row', performance.now() - started, 'ms');
        await evidence.shot(`${ROOMS} rooms: the top of home`);

        const reads = await requestsDuring(page, () => backend.frames, AFTER_PAINT_WINDOW);
        for (const type of ['channel.get', 'join.get', 'profile.get']) {
            evidence.metric(
                `${type} in the ${AFTER_PAINT_WINDOW / 1000}s after first paint`,
                reads[type] ?? 0,
                'count'
            );
        }
        evidence.metric(
            `socket requests in the ${AFTER_PAINT_WINDOW / 1000}s after first paint`,
            Object.values(reads).reduce((sum, n) => sum + n, 0),
            'count'
        );
        evidence.metric('heap after first paint', await heapMB(page), 'MB', HEAP_NOTE);

        const oldest = roomRow(page, loadRoomTitle(1));
        let screens = 0;
        evidence.metric(
            'scroll to the oldest room',
            await msOf(async () => (screens = await scrollUntilVisible(page, oldest))),
            'ms'
        );
        evidence.metric('screens scrolled', screens, 'count');
        await expect(oldest).toHaveCount(1);
        await expect(oldest).toBeInViewport();
        evidence.metric('heap after scrolling', await heapMB(page), 'MB', HEAP_NOTE);
        await evidence.shot(`${ROOMS} rooms: scrolled to the oldest`);

        evidence.metric(
            'open the oldest room',
            await msOf(async () => {
                await oldest.click();
                await msUntilVisible(page.getByText(`Message 3 in ${loadRoomTitle(1)}`));
            }),
            'ms'
        );
    }
);
