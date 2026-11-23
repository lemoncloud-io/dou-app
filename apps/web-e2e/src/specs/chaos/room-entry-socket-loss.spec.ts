import { chatView, DM_CHANNEL, DM_FIRST_MESSAGE, dmRoom, MINA, roomsSocket } from '../../fixtures/rooms';
import { composer, home, roomRow } from '../../support/app';
import { expect, test } from '../../support/test';

const WRITTEN_DURING_OUTAGE = 'Did the tunnel eat my message?';

test(
    'a room opened while the relay is down opens, and fills in once the socket is back',
    { tag: '@chaos' },
    async ({ page, backend, chaos, evidence }) => {
        const room = dmRoom();
        backend.useSocket(roomsSocket(backend, [room]));
        await page.goto('/');
        await expect(roomRow(page, MINA.nick)).toBeVisible();

        const outage = 6_000;
        await chaos.dropSocket({ downFor: outage });
        room.chats.push(chatView(DM_CHANNEL.id, 2, WRITTEN_DURING_OUTAGE));
        room.channel.chatNo = 2;
        await roomRow(page, MINA.nick).click();
        await expect(composer(page)).toBeVisible();
        expect(backend.connections).toBe(1);
        await expect(page.getByRole('heading', { name: 'An Error Occurred' })).toHaveCount(0);
        await evidence.shot('relay down: the room is open, its history not yet loaded');

        await expect.poll(() => backend.connections, { timeout: outage + 15_000 }).toBeGreaterThan(1);
        chaos.recovered('relay socket reopened');
        await expect(page.getByText(WRITTEN_DURING_OUTAGE)).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText(DM_FIRST_MESSAGE)).toBeVisible();
        chaos.recovered('room history loaded on the new socket');
        expect(backend.sent('chat.feed').some(frame => frame.connection > 1)).toBe(true);
        await expect(composer(page)).toBeVisible();
        await evidence.shot('relay back: the room caught up on the same screen');

        await page.goBack();
        await expect(home(page)).toBeVisible();
        await expect(roomRow(page, MINA.nick)).toHaveCount(1);
    }
);
