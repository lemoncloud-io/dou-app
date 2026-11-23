import type { Page } from '@playwright/test';

import { SocketRefusal, type FakeBackend } from '../fixtures/backend';
import { GUEST } from '../fixtures/guest';
import { chatView, DM_CHANNEL, dmRoom, MINA, roomsSocket } from '../fixtures/rooms';
import { composer, home, roomRow } from '../support/app';
import { expect, test } from '../support/test';

const MESSAGES = ['Are we still on for Friday?', 'I booked the table for seven.', 'Bring the photos!'];

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

    let releaseSignIn: () => void = () => undefined;
    const signedInAgain = new Promise<void>(resolve => (releaseSignIn = resolve));
    const signIn = backend.handlerOf('auth.update');
    backend.useSocket({ 'auth.update': (data, frame) => signedInAgain.then(() => signIn(data, frame)) });
    await backend.dropSockets();
    await expect.poll(() => backend.sent('auth.update').filter(frame => frame.connection > 1).length).toBe(1);

    await roomRow(page, MINA.nick).click();
    await expect(composer(page)).toBeVisible();
    await page.goBack();
    await expect(home(page)).toBeVisible();

    await expect(unreadCount(page)).toHaveCount(0);
    expect(roomReads(backend)).toEqual([]);

    releaseSignIn();
    await expect.poll(() => relay.readUpTo, { timeout: 10_000 }).toBe(MESSAGES.length);
    expect(roomReads(backend).every(frame => frame.connection > 1)).toBe(true);
    await expect(unreadCount(page)).toHaveCount(0);
});
