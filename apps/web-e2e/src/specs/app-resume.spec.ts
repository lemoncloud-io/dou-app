import type { Page } from '@playwright/test';

import { chatView, DM_CHANNEL, DM_FIRST_MESSAGE, dmRoom, MINA, roomsSocket } from '../fixtures/rooms';
import { bringToForeground, currentPath, sendToBackground } from '../support/app';
import type { FakeShell } from '../support/fake-shell/fakeShell';
import { expect, test } from '../support/test';

const REPLY_WHILE_AWAY = 'Running ten minutes late, sorry!';

const openDmRoom = async (page: Page, shell: FakeShell): Promise<void> => {
    await page.goto('/');
    await page.getByText(MINA.nick).first().click();
    await expect(page.getByText(DM_FIRST_MESSAGE)).toBeVisible();
    await shell.waitFor('StopPerfTrace', message => message.data.name === 'chat_room_sync');
};

test('back in the foreground, the cover comes down and the room shows what arrived', async ({
    page,
    shell,
    backend,
}) => {
    const room = dmRoom();
    backend.useSocket(roomsSocket(backend, [room]));
    await openDmRoom(page, shell);
    const roomPath = await currentPath(page);

    sendToBackground(shell);
    room.chats.push(chatView(DM_CHANNEL.id, 2, REPLY_WHILE_AWAY));
    room.channel.chatNo = 2;
    const feedsBefore = backend.sent('chat.feed').length;
    bringToForeground(shell);

    await expect.poll(() => shell.received('DismissResumeOverlay').length).toBe(1);
    await expect(page.getByText(REPLY_WHILE_AWAY)).toBeVisible();
    expect(backend.sent('chat.feed').length).toBeGreaterThan(feedsBefore);
    expect(await currentPath(page)).toBe(roomPath);
    await expect(page.getByText(DM_FIRST_MESSAGE)).toBeVisible();
});

test('a socket dropped while away is opened again, and the room catches up on the same screen', async ({
    page,
    shell,
    backend,
}) => {
    const room = dmRoom();
    backend.useSocket(roomsSocket(backend, [room]));
    await openDmRoom(page, shell);
    const roomPath = await currentPath(page);
    expect(backend.connections).toBe(1);

    sendToBackground(shell);
    room.chats.push(chatView(DM_CHANNEL.id, 2, REPLY_WHILE_AWAY));
    room.channel.chatNo = 2;
    await backend.dropSockets();
    bringToForeground(shell);

    await expect.poll(() => shell.received('DismissResumeOverlay').length).toBe(1);
    const onNewSocket = (type: string) => backend.sent(type).filter(frame => frame.connection > 1).length;
    await expect.poll(() => onNewSocket('auth.update')).toBeGreaterThan(0);
    await expect(page.getByText(REPLY_WHILE_AWAY)).toBeVisible({ timeout: 15_000 });
    expect(onNewSocket('chat.feed')).toBeGreaterThan(0);
    expect(await currentPath(page)).toBe(roomPath);
});

test('a socket left half-open while away is replaced within seconds, and the room catches up', async ({
    page,
    shell,
    backend,
}) => {
    const room = dmRoom();
    backend.useSocket(roomsSocket(backend, [room]));
    await openDmRoom(page, shell);
    const roomPath = await currentPath(page);
    expect(backend.connections).toBe(1);

    sendToBackground(shell);
    room.chats.push(chatView(DM_CHANNEL.id, 2, REPLY_WHILE_AWAY));
    room.channel.chatNo = 2;
    backend.silenceSockets();
    bringToForeground(shell);

    await expect.poll(() => backend.connections, { timeout: 10_000 }).toBe(2);
    const onNewSocket = (type: string) => backend.sent(type).filter(frame => frame.connection > 1).length;
    await expect.poll(() => onNewSocket('auth.update')).toBeGreaterThan(0);
    await expect(page.getByText(REPLY_WHILE_AWAY)).toBeVisible({ timeout: 15_000 });
    expect(onNewSocket('chat.feed')).toBeGreaterThan(0);
    expect(await currentPath(page)).toBe(roomPath);
});
