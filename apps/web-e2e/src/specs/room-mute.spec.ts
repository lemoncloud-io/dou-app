import { GUEST } from '../fixtures/guest';
import { DM_CHANNEL, dmRoom, MINA, roomsSocket } from '../fixtures/rooms';
import { home, roomRow } from '../support/app';
import { expect, test } from '../support/test';

test('a room muted while the socket signs in again shows muted at once, and the relay hears once it is back', async ({
    page,
    backend,
}) => {
    const relay = { notify: 'all' as string };
    const handlers = roomsSocket(backend, [dmRoom()]);
    const myJoin = () => ({
        id: `${DM_CHANNEL.id}@${GUEST.uid}`,
        channelId: DM_CHANNEL.id,
        userId: GUEST.uid,
        joined: 1,
        chatNo: DM_CHANNEL.chatNo,
        notify: relay.notify,
    });
    const isRoom = (data: unknown) => {
        const { channelId, id } = (data ?? {}) as { channelId?: string; id?: string };
        return (channelId ?? id?.split('@')[0]) === DM_CHANNEL.id;
    };
    backend.useSocket({
        ...handlers,
        'join.get': (data, frame) => (isRoom(data) ? myJoin() : handlers['join.get'](data, frame)),
        'join.update': data => {
            if (!isRoom(data)) throw new Error('e2e: join.update for another row');
            relay.notify = (data as { notify: string }).notify;
            return myJoin();
        },
    });
    await page.goto('/');
    await expect(roomRow(page, MINA.nick)).toBeVisible();
    await expect(roomRow(page, MINA.nick).getByRole('status')).toHaveCount(0);

    let releaseSignIn: () => void = () => undefined;
    const signedInAgain = new Promise<void>(resolve => (releaseSignIn = resolve));
    const signIn = backend.handlerOf('auth.update');
    backend.useSocket({ 'auth.update': (data, frame) => signedInAgain.then(() => signIn(data, frame)) });
    await backend.dropSockets();
    await expect.poll(() => backend.sent('auth.update').filter(frame => frame.connection > 1).length).toBe(1);

    await page
        .locator('button', { hasText: /^Mute$/ })
        .first()
        .dispatchEvent('click');

    await expect(page.getByLabel('Notifications off')).toBeVisible();
    expect(backend.sent('join.update')).toEqual([]);

    releaseSignIn();
    await expect.poll(() => relay.notify, { timeout: 10_000 }).toBe('none');
    expect(backend.sent('join.update').every(frame => frame.connection > 1)).toBe(true);
    await expect(home(page)).toBeVisible();
    await expect(page.getByLabel('Notifications off')).toBeVisible();
});
