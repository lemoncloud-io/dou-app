import type { Page } from '@playwright/test';

import { chatView, DM_CHANNEL, DM_FIRST_MESSAGE, dmRoom, MINA, roomsSocket } from '../fixtures/rooms';
import { bringToForeground, currentPath, sendToBackground } from '../support/app';
import type { FakeShell } from '../support/fake-shell/fakeShell';
import { expect, test } from '../support/test';

/**
 * Coming back to the app (apps/web/docs/bridge/README.md § Foreground detection). The shell reports
 * every move between background and foreground (`OnBackgroundStatusChanged`) and covers the WebView
 * with a snapshot while it was away; the page asks for the cover to come down (`DismissResumeOverlay`)
 * once it has painted and refreshes the open room for what arrived meanwhile — all without leaving
 * the screen the person was on.
 *
 * Not covered: the wake kick for a half-open socket (`useSocketWakeRecovery`). Such a socket still
 * reads as verified until the keep-alive misses its pongs, which no fixture here imitates; a socket
 * the relay closed, which is what this suite can produce, reconnects on its own without the kick.
 */

const REPLY_WHILE_AWAY = 'Running ten minutes late, sorry!';

/**
 * Into the 1:1, and wait until the room has finished its own entry sync — the page ends its
 * `chat_room_sync` trace when the room shows its synced history, and stops it through the shell. On
 * screen is not enough: until then the room's entry reads may still be on their way, and leaving
 * during one tests a different moment (a cache still read as cold, a read still in flight).
 */
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
    // Mina wrote while the app was away; the push went nowhere, so only the room's refresh can bring it.
    room.chats.push(chatView(DM_CHANNEL.id, 2, REPLY_WHILE_AWAY));
    room.channel.chatNo = 2;
    const feedsBefore = backend.sent('chat.feed').length;
    bringToForeground(shell);

    await expect.poll(() => shell.received('DismissResumeOverlay').length).toBe(1);
    await expect(page.getByText(REPLY_WHILE_AWAY)).toBeVisible();
    expect(backend.sent('chat.feed').length).toBeGreaterThan(feedsBefore);
    // Still in the room it left from.
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
    // Mina writes, then the connection dies — in that order, so whichever read follows the reconnect
    // (the socket can come back the moment it is dropped) is one that should find her message.
    room.chats.push(chatView(DM_CHANNEL.id, 2, REPLY_WHILE_AWAY));
    room.channel.chatNo = 2;
    await backend.dropSockets();
    bringToForeground(shell);

    // The cover does not wait on the network: it comes down whatever the socket is doing.
    await expect.poll(() => shell.received('DismissResumeOverlay').length).toBe(1);
    // A new socket, signed in again, and the room caught up over it.
    const onNewSocket = (type: string) => backend.sent(type).filter(frame => frame.connection > 1).length;
    await expect.poll(() => onNewSocket('auth.update')).toBeGreaterThan(0);
    // The catch-up rides the new session's whole re-sync (places, profiles, rooms), so it is given the
    // suite's 15s rather than the 5s default: on a loaded runner that re-sync alone has taken longer.
    await expect(page.getByText(REPLY_WHILE_AWAY)).toBeVisible({ timeout: 15_000 });
    expect(onNewSocket('chat.feed')).toBeGreaterThan(0);
    expect(await currentPath(page)).toBe(roomPath);
});
