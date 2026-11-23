import { addImageMessages, imageHost } from '../../fixtures/load';
import { dmRoom, MINA, roomsSocket } from '../../fixtures/rooms';
import { roomRow } from '../../support/app';
import { HEAP_NOTE, heapMB, msOf } from '../../support/load';
import { expect, test } from '../../support/test';

const PHOTOS = 200;

test(
    `a room with ${PHOTOS} photos opens with the visible ones loaded`,
    { tag: '@load' },
    async ({ page, backend, evidence }) => {
        test.setTimeout(120_000);
        const room = dmRoom();
        addImageMessages(room, PHOTOS);
        backend.useSocket(roomsSocket(backend, [room]));
        const host = imageHost();
        backend.useHttp(host.handlers);
        await page.goto('/');
        await roomRow(page, MINA.nick).waitFor();

        const loadedOnScreen = () =>
            page.locator('img').evaluateAll(
                images =>
                    images.filter(img => {
                        const box = img.getBoundingClientRect();
                        const onScreen = box.bottom > 0 && box.top < window.innerHeight && box.width > 40;
                        return (
                            onScreen && (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0
                        );
                    }).length
            );

        evidence.metric(
            'enter → photos on screen loaded',
            await msOf(async () => {
                await roomRow(page, MINA.nick).click();
                await expect.poll(loadedOnScreen, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
            }),
            'ms'
        );
        await page.waitForTimeout(2_000);
        evidence.metric('photos drawn on screen', await loadedOnScreen(), 'count');
        evidence.metric('image requests for the room', host.served.length, 'count');
        evidence.metric('heap with the room open', await heapMB(page), 'MB', HEAP_NOTE);
        await evidence.shot(`${PHOTOS} photos: the room as it opens`);
    }
);
