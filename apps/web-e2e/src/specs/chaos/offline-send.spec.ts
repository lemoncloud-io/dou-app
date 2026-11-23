import { chatSendSocket, DM_FIRST_MESSAGE, dmRoom, MINA, roomsSocket } from '../../fixtures/rooms';
import { composer } from '../../support/app';
import { expect, test } from '../../support/test';

const OFFLINE_TEXT = 'Written on the train, no signal';

test(
    'a message sent offline fails visibly, and Retry after the network returns delivers it once',
    { tag: '@chaos' },
    async ({ page, backend, chaos, evidence }) => {
        const room = dmRoom();
        const relay = chatSendSocket([room]);
        backend.useSocket({ ...roomsSocket(backend, [room]), ...relay.handlers });
        await page.goto('/');
        await page.getByText(MINA.nick).first().click();
        await expect(page.getByText(DM_FIRST_MESSAGE)).toBeVisible();

        await chaos.offline();
        await composer(page).fill(OFFLINE_TEXT);
        await page.getByRole('button', { name: 'Send', exact: true }).click();

        const retry = page.getByRole('button', { name: 'Retry' });
        await expect(page.getByText('Failed', { exact: true })).toBeVisible();
        await expect(retry).toBeVisible();
        await expect(page.getByText(OFFLINE_TEXT)).toHaveCount(1);
        expect(relay.sends).toEqual([]);
        await evidence.shot('offline: the message is marked failed, with Retry');

        await chaos.online();
        await expect
            .poll(() => backend.sent('auth.update').filter(frame => frame.connection > 1).length)
            .toBeGreaterThan(0);
        chaos.recovered('relay socket signed in again');

        await retry.click();
        await expect(page.getByText('Failed', { exact: true })).toHaveCount(0);
        await expect.poll(() => relay.sends.map(send => send.content)).toEqual([OFFLINE_TEXT]);
        await expect(page.getByText(OFFLINE_TEXT)).toHaveCount(1);
        expect(backend.sent('chat.send').every(frame => frame.connection > 1)).toBe(true);
        chaos.recovered('message delivered once');
        await evidence.shot('online: delivered once, no failed row left');
    }
);
