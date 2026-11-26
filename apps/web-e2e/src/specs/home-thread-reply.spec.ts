import { chatView, DM_CHANNEL, DM_FIRST_MESSAGE, dmRoom, MINA, roomsSocket } from '../fixtures/rooms';
import { home, roomRow } from '../support/app';
import { expect, test } from '../support/test';

const REPLY = 'Seven works for me.';

test('a thread reply on an older message leads its home row, and the row opens that thread', async ({
    page,
    backend,
    evidence,
}) => {
    const room = dmRoom();
    room.chats = [
        chatView(DM_CHANNEL.id, 1, DM_FIRST_MESSAGE),
        Object.assign(chatView(DM_CHANNEL.id, 2, REPLY), { parentId: `${DM_CHANNEL.id}:1` }),
    ];
    room.channel.chatNo = 2;
    backend.useSocket(roomsSocket(backend, [room]));

    await page.goto('/');
    await expect(home(page)).toBeVisible();
    const row = roomRow(page, MINA.nick);
    await expect(row).toContainText(`[Thread] ${REPLY}`);
    await expect(row).not.toContainText(DM_FIRST_MESSAGE);
    await evidence.shot('the home row prints the thread reply behind its mark');

    await row.click();
    await expect(page).toHaveURL(new RegExp(`/channels/${DM_CHANNEL.id}/thread/1\\?chatNo=2$`));
    await expect(page.getByText(REPLY)).toBeVisible();
    await evidence.shot('the row opened the thread on the reply');
});
