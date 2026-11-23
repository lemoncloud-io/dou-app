import type { Page } from '@playwright/test';

import type { FakeBackend } from '../fixtures/backend';
import {
    CLOUD,
    CLOUD_PLACE,
    CLOUD_ROOM,
    CLOUD_USER,
    installCloud,
    ownCloud,
    SECOND_PLACE,
    SECOND_PLACE_ROOM,
    type OwnedCloudState,
} from '../fixtures/cloud';
import { GUEST, GUEST_NICK, SELF_CHANNEL } from '../fixtures/guest';
import { DM_CHANNEL, dmRoom, MINA, roomsSocket } from '../fixtures/rooms';
import { composer, roomRow } from '../support/app';
import type { FakeShell } from '../support/fake-shell/fakeShell';
import { expect, test } from '../support/test';

const switcher = (page: Page) => page.getByRole('banner').getByRole('button', { name: 'Switch Cloud', exact: true });

const placeChips = (page: Page) => page.getByRole('group', { name: 'Places', exact: true });

const placeRow = (page: Page, name: string) =>
    placeChips(page).getByRole('button', { name: new RegExp(`^${name}(, .*)?$`) });

const isSelectedPlace = (page: Page, name: string) =>
    placeChips(page).getByRole('button', { name: new RegExp(`^${name}(, .*)?$`), pressed: true });

const expectRelayHome = async (page: Page): Promise<void> => {
    await expect(switcher(page).getByRole('img', { name: 'DoU' })).toBeVisible();
    await expect(roomRow(page, MINA.nick)).toBeVisible();
    await expect(roomRow(page, GUEST_NICK)).toBeVisible();
    await expect(placeChips(page)).toHaveCount(0);
    for (const room of [CLOUD_ROOM, SECOND_PLACE_ROOM]) await expect(roomRow(page, room.name)).toHaveCount(0);
};

const openSwitcher = async (page: Page) => {
    await switcher(page).click();
    return page.getByRole('dialog', { name: 'Switch Cloud' });
};

const cachedRoomIds = (shell: FakeShell, cid: string, uid: string): string[] =>
    shell.cache
        .rows('channel', { cid, uid })
        .map(row => row.id)
        .sort();

const switchTargets = (backend: FakeBackend): string[] =>
    backend.sentAt(CLOUD.wss, 'auth.switch').map(frame => String((frame.data as { target?: string }).target));

const RELAY_PARTITION = { cid: 'default', uid: GUEST.uid };

test('entering a cloud and moving between its places shows only that place, and back home only the relay', async ({
    page,
    shell,
    backend,
}) => {
    backend.useSocket(roomsSocket(backend, [dmRoom()]));
    ownCloud(backend);
    const cloud = installCloud(backend, { profileInPlace: true, secondPlace: true });

    await page.goto('/');
    await expectRelayHome(page);

    await (await openSwitcher(page)).getByRole('button', { name: new RegExp(`^\\S ${CLOUD.name}\\b`) }).click();
    await expect(switcher(page)).toContainText(CLOUD.name);
    await expect(isSelectedPlace(page, CLOUD_PLACE.name)).toBeVisible();
    await expect(roomRow(page, CLOUD_ROOM.name)).toBeVisible();
    for (const title of [MINA.nick, GUEST_NICK, SECOND_PLACE_ROOM.name]) {
        await expect(roomRow(page, title)).toHaveCount(0);
    }
    await expect.poll(() => cloud.sessionSite).toBe(CLOUD_PLACE.id);

    await expect
        .poll(() => cachedRoomIds(shell, CLOUD.id, CLOUD_USER.uid))
        .toEqual([CLOUD_ROOM.id, SECOND_PLACE_ROOM.id].sort());
    expect(cachedRoomIds(shell, RELAY_PARTITION.cid, RELAY_PARTITION.uid)).toEqual(
        [DM_CHANNEL.id, SELF_CHANNEL.id].sort()
    );

    await placeRow(page, SECOND_PLACE.name).click();
    await expect(isSelectedPlace(page, SECOND_PLACE.name)).toBeVisible();
    await expect(roomRow(page, SECOND_PLACE_ROOM.name)).toBeVisible();
    await expect(roomRow(page, CLOUD_ROOM.name)).toHaveCount(0);
    await expect(isSelectedPlace(page, CLOUD_PLACE.name)).toHaveCount(0);
    await expect.poll(() => switchTargets(backend)).toContain(`${CLOUD_USER.uid}@${SECOND_PLACE.id}`);
    await expect.poll(() => cloud.sessionSite).toBe(SECOND_PLACE.id);

    await (await openSwitcher(page)).getByRole('button', { name: /^DoU Home( Unread)?$/ }).click();
    await expectRelayHome(page);
});

const tryRefusedCloud = async (
    page: Page,
    backend: FakeBackend,
    owned: OwnedCloudState,
    {
        beforeTap,
        beforeRefusal,
    }: {
        beforeTap?: () => void;
        beforeRefusal?: () => Promise<void>;
    } = {}
): Promise<void> => {
    await page.goto('/');
    await expectRelayHome(page);
    await expect.poll(() => owned.delegations).toBeGreaterThanOrEqual(1);
    let asked = false;
    let release: () => void = () => undefined;
    const held = new Promise<void>(resolve => (release = resolve));
    backend.gateHttp('POST /users/0/delegate-cloud', () => {
        asked = true;
        return held;
    });
    beforeTap?.();

    await (await openSwitcher(page)).getByRole('button', { name: new RegExp(`^\\S ${CLOUD.name}\\b`) }).click();
    await expect(switcher(page)).toContainText(CLOUD.name);
    await expect.poll(() => asked).toBe(true);
    await beforeRefusal?.();
    release();
};

test('a cloud that cannot be entered is rolled back: the switcher is on DoU again, and the cloud never reached', async ({
    page,
    shell,
    backend,
}) => {
    backend.useSocket(roomsSocket(backend, [dmRoom()]));
    const owned = ownCloud(backend, { issue: false });
    installCloud(backend, { profileInPlace: true, secondPlace: true });
    await tryRefusedCloud(page, backend, owned);

    await expect(switcher(page).getByRole('img', { name: 'DoU' })).toBeVisible();
    await expect(switcher(page)).not.toContainText(CLOUD.name);
    await expect(placeChips(page)).toHaveCount(0);
    for (const room of [CLOUD_ROOM, SECOND_PLACE_ROOM]) await expect(roomRow(page, room.name)).toHaveCount(0);
    expect(backend.allFrames.filter(frame => frame.endpoint === CLOUD.wss)).toEqual([]);
    expect(cachedRoomIds(shell, CLOUD.id, CLOUD_USER.uid)).toEqual([]);
    expect(cachedRoomIds(shell, CLOUD.id, GUEST.uid)).toEqual([]);
});

const holdCloudChannelReads = (shell: FakeShell) => {
    const { FetchAllCacheData: answer } = shell.cache.handlers();
    if (!answer) throw new Error('the memory cache answers FetchAllCacheData');
    let armed = false;
    let release: () => void = () => undefined;
    const released = new Promise<void>(resolve => (release = resolve));
    const reads = { held: 0, answered: 0 };
    shell.handle('FetchAllCacheData', async (data, message) => {
        if (armed && data.type === 'channel' && data.cid === CLOUD.id) {
            reads.held += 1;
            await released;
            const reply = await answer(data, message);
            reads.answered += 1;
            return reply;
        }
        return answer(data, message);
    });
    return {
        reads,
        arm: () => {
            armed = true;
        },
        release: () => release(),
    };
};

test('a cloud that cannot be entered leaves the relay rooms on home', async ({ page, shell, backend }) => {
    backend.useSocket(roomsSocket(backend, [dmRoom()]));
    const owned = ownCloud(backend, { issue: false });
    installCloud(backend, { profileInPlace: true, secondPlace: true });
    const cloudReads = holdCloudChannelReads(shell);
    await tryRefusedCloud(page, backend, owned, {
        beforeTap: cloudReads.arm,
        beforeRefusal: () => expect.poll(() => cloudReads.reads.held).toBeGreaterThan(0),
    });

    await expectRelayHome(page);

    cloudReads.release();
    await expect.poll(() => cloudReads.reads.answered).toBe(cloudReads.reads.held);
    await page.evaluate(
        () => new Promise<void>(resolve => setTimeout(() => requestAnimationFrame(() => resolve()), 100))
    );
    expect(await roomRow(page, MINA.nick).count()).toBe(1);
    expect(await roomRow(page, GUEST_NICK).count()).toBe(1);
    await expectRelayHome(page);
    await roomRow(page, MINA.nick).click();
    await expect(composer(page)).toBeVisible();
});

test('a place the cloud will not move into leaves the previous place selected, with its rooms', async ({
    page,
    backend,
}) => {
    backend.useSocket(roomsSocket(backend, [dmRoom()]));
    ownCloud(backend);
    const cloud = installCloud(backend, { profileInPlace: true, secondPlace: true });
    cloud.refuseSwitchInto = SECOND_PLACE.id;
    let release: () => void = () => undefined;
    cloud.refusalHeld = new Promise<void>(resolve => (release = resolve));

    await page.goto('/');
    await expectRelayHome(page);
    await (await openSwitcher(page)).getByRole('button', { name: new RegExp(`^\\S ${CLOUD.name}\\b`) }).click();
    await expect(isSelectedPlace(page, CLOUD_PLACE.name)).toBeVisible();
    await expect(roomRow(page, CLOUD_ROOM.name)).toBeVisible();

    await placeRow(page, SECOND_PLACE.name).click();
    await expect(isSelectedPlace(page, CLOUD_PLACE.name)).toHaveCount(0);
    await expect.poll(() => switchTargets(backend)).toContain(`${CLOUD_USER.uid}@${SECOND_PLACE.id}`);
    release();

    await expect(isSelectedPlace(page, CLOUD_PLACE.name)).toBeVisible();
    await expect(isSelectedPlace(page, SECOND_PLACE.name)).toHaveCount(0);
    await expect(roomRow(page, CLOUD_ROOM.name)).toBeVisible();
    await expect(roomRow(page, SECOND_PLACE_ROOM.name)).toHaveCount(0);
});
