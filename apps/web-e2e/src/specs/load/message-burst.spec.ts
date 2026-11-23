import { chatView, DM_CHANNEL, DM_FIRST_MESSAGE, dmRoom, MINA, roomsSocket } from '../../fixtures/rooms';
import { composer, roomRow } from '../../support/app';
import { HEAP_NOTE, heapMB, msOf } from '../../support/load';
import { expect, test } from '../../support/test';

const BURST = 300;
const burstLine = (n: number) => `Burst message ${n}`;

test(
    `${BURST} messages pushed into an open room land in order, once each`,
    { tag: '@load' },
    async ({ page, backend, evidence }) => {
        test.setTimeout(120_000);
        const room = dmRoom();
        backend.useSocket(roomsSocket(backend, [room]));
        await page.goto('/');
        await roomRow(page, MINA.nick).click();
        await expect(page.getByText(DM_FIRST_MESSAGE)).toBeVisible();
        await page.waitForTimeout(1_500);

        evidence.metric(
            'first push → last message on screen',
            await msOf(async () => {
                for (let n = 1; n <= BURST; n += 1) {
                    const row = chatView(DM_CHANNEL.id, n + 1, burstLine(n));
                    room.chats.push(row);
                    room.channel.chatNo = n + 1;
                    backend.push({ type: 'chat.sync', data: row });
                }
                await expect(page.getByText(burstLine(BURST), { exact: true })).toBeVisible({ timeout: 60_000 });
            }),
            'ms'
        );
        evidence.metric('heap after the burst', await heapMB(page), 'MB', HEAP_NOTE);
        await evidence.shot(`${BURST} pushed messages: the last one on screen`);

        const shown = await page
            .locator('[data-chat-no]')
            .evaluateAll(rows => rows.map(r => Number(r.getAttribute('data-chat-no'))));
        const burstRows = shown.filter(no => no > 1);
        evidence.metric('pushed messages in the DOM', burstRows.length, 'count');
        expect(burstRows.length).toBeGreaterThan(50);
        const sorted = [...burstRows].sort((a, b) => a - b);
        expect(sorted).toEqual(Array.from({ length: sorted.length }, (_, i) => BURST + 1 - sorted.length + 1 + i));
        await composer(page).fill('still typing after the burst');
        await expect(composer(page)).toHaveValue('still typing after the burst');
    }
);
