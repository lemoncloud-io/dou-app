import type { Page } from '@playwright/test';

import { SocketRefusal, type FakeBackend } from '../fixtures/backend';
import { GUEST } from '../fixtures/guest';
import { chatView, DM_CHANNEL, dmRoom, MINA, roomsSocket } from '../fixtures/rooms';
import { composer, home, roomRow } from '../support/app';
import { expect, test } from '../support/test';

/**
 * Reading a room clears its unread count on the list straight away, and the relay hears about the
 * read whenever the socket can carry it (apps/web/docs/feature/channels/data-layer.md § Reads advance
 * in two stages). The count is computed on the device from the guest's read cursor, so these check the
 * list, not the relay's answer — and then that the relay does get the read in the end.
 */

const MESSAGES = ['Are we still on for Friday?', 'I booked the table for seven.', 'Bring the photos!'];

/**
 * The 1:1 with Mina, three messages the guest has not read, and a relay that remembers how far the
 * guest has read: `join.get` reports it and `chat.read` moves it. `onRead` decides each `chat.read`'s
 * fate before the relay records it — throw to refuse it.
 */
const unreadRoom = (backend: FakeBackend, onRead: (attempt: number) => void = () => undefined) => {
    const room = dmRoom();
    room.chats = MESSAGES.map((content, index) => chatView(DM_CHANNEL.id, index + 1, content));
    room.channel.chatNo = MESSAGES.length;

    const relay = { readUpTo: 0, attempts: 0 };
    const handlers = roomsSocket(backend, [room]);
    const myJoin = () => ({
        id: `${DM_CHANNEL.id}@${GUEST.uid}`,
        channelId: DM_CHANNEL.id,
        userId: GUEST.uid,
        joined: 1,
        chatNo: relay.readUpTo,
    });
    const isRoom = (data: unknown) => (data as { channelId?: string } | null)?.channelId === DM_CHANNEL.id;
    backend.useSocket({
        ...handlers,
        'join.get': (data, frame) => (isRoom(data) ? myJoin() : handlers['join.get'](data, frame)),
        'chat.read': (data, frame) => {
            if (!isRoom(data)) return handlers['chat.read'](data, frame);
            relay.attempts += 1;
            onRead(relay.attempts);
            relay.readUpTo = Math.max(relay.readUpTo, (data as { chatNo: number }).chatNo);
            return myJoin();
        },
    });
    return relay;
};

/** Mina's row's unread count, which is not drawn at all at zero. */
const unreadCount = (page: Page) => roomRow(page, MINA.nick).getByRole('status');

const roomReads = (backend: FakeBackend) =>
    backend.sent('chat.read').filter(frame => (frame.data as { channelId?: string }).channelId === DM_CHANNEL.id);

test('a read the relay failed stays read on the list, and is sent again', async ({ page, backend }) => {
    const relay = unreadRoom(backend, attempt => {
        if (attempt === 1) throw new SocketRefusal('500 INTERNAL SERVER ERROR - e2e: the first read fails');
    });
    await page.goto('/');
    await expect(unreadCount(page)).toHaveText(String(MESSAGES.length));

    await roomRow(page, MINA.nick).click();
    await expect(page.getByText(MESSAGES[2])).toBeVisible();
    await expect.poll(() => relay.attempts).toBeGreaterThanOrEqual(1);
    await page.goBack();
    await expect(home(page)).toBeVisible();

    // The refusal did not bring the count back, and the read went out again on its own.
    await expect(unreadCount(page)).toHaveCount(0);
    await expect.poll(() => relay.readUpTo, { timeout: 10_000 }).toBe(MESSAGES.length);
    await expect(unreadCount(page)).toHaveCount(0);
});

test('a room entered while the socket signs in again is read at once, and the relay hears once it is back', async ({
    page,
    backend,
}) => {
    const relay = unreadRoom(backend);
    await page.goto('/');
    await expect(unreadCount(page)).toHaveText(String(MESSAGES.length));

    // The connection drops and the next sign-in is held: the page has a socket that is not verified.
    let releaseSignIn: () => void = () => undefined;
    const signedInAgain = new Promise<void>(resolve => (releaseSignIn = resolve));
    const signIn = backend.handlerOf('auth.update');
    backend.useSocket({ 'auth.update': (data, frame) => signedInAgain.then(() => signIn(data, frame)) });
    await backend.dropSockets();
    await expect.poll(() => backend.sent('auth.update').filter(frame => frame.connection > 1).length).toBe(1);

    // The room on screen — its feed cannot load without the socket, so its composer is the sign.
    await roomRow(page, MINA.nick).click();
    await expect(composer(page)).toBeVisible();
    await page.goBack();
    await expect(home(page)).toBeVisible();

    // Read on the list before the relay could have heard of it.
    await expect(unreadCount(page)).toHaveCount(0);
    expect(roomReads(backend)).toEqual([]);

    releaseSignIn();
    await expect.poll(() => relay.readUpTo, { timeout: 10_000 }).toBe(MESSAGES.length);
    expect(roomReads(backend).every(frame => frame.connection > 1)).toBe(true);
    await expect(unreadCount(page)).toHaveCount(0);
});
