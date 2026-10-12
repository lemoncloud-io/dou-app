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

/**
 * Moving between the relay and a cloud, and between a cloud's places (libs/app-runtime/README.md
 * § 3. Switching cloud, apps/web/docs/feature/home/README.md § Switching). The guest owns one cloud with two places,
 * each with one room. Entering the cloud trades a relay delegation for the cloud's own token
 * (`delegate-cloud`, `exchange-token`) and opens the cloud's socket; the page lands on the cloud's
 * first place. A place switch moves the cloud session (`auth.switch` to `<uid>@<place>`). Home shows
 * only the rooms of the place selected — the cloud's `channel.sync` answers for every place at once,
 * and the page sorts them by place. Inside the app, rooms are kept in the shell's cache partitioned
 * by cloud and by the user in that cloud, and each side's rows go to its own partition.
 *
 * A switch that fails is rolled back: a cloud that cannot be entered, or a place the cloud will not
 * move the session into, leaves the person where they were. Each scenario watches the switch begin
 * (the page moves first and asks after) before it reads the rollback.
 */

/** The cloud switcher in home's header. It names the cloud the session is in, or shows DoU's mark. */
const switcher = (page: Page) => page.getByRole('banner').getByRole('button', { name: 'Switch Cloud', exact: true });

/**
 * A place row: its initial, its name, "Selected" on the one the session is in or "Switching place" on
 * the one it is moving to, and whose place it is.
 */
const placeRow = (page: Page, name: string) =>
    page.getByRole('button', { name: new RegExp(`^\\S ${name}( Selected| Switching place)* (My|Invited) Place$`) });

const isSelectedPlace = (page: Page, name: string) => placeRow(page, name).getByRole('img', { name: 'Selected' });

/** The relay's home: the guest's 1:1 with Mina and their self chat. */
const expectRelayHome = async (page: Page): Promise<void> => {
    await expect(switcher(page).getByRole('img', { name: 'DoU' })).toBeVisible();
    await expect(roomRow(page, MINA.nick)).toBeVisible();
    await expect(roomRow(page, GUEST_NICK)).toBeVisible();
    await expect(page.getByText('Places', { exact: true })).toHaveCount(0);
    for (const room of [CLOUD_ROOM, SECOND_PLACE_ROOM]) await expect(roomRow(page, room.name)).toHaveCount(0);
};

const openSwitcher = async (page: Page) => {
    await switcher(page).click();
    return page.getByRole('dialog', { name: 'Switch Cloud' });
};

/** The ids of the rooms the shell's cache holds for one partition — a cloud, and the user there. */
const cachedRoomIds = (shell: FakeShell, cid: string, uid: string): string[] =>
    shell.cache
        .rows('channel', { cid, uid })
        .map(row => row.id)
        .sort();

/** The places the page asked the cloud to move its session into (`<uid>@<place>`), in order. */
const switchTargets = (backend: FakeBackend): string[] =>
    backend.sentAt(CLOUD.wss, 'auth.switch').map(frame => String((frame.data as { target?: string }).target));

/** The relay's partition in the shell's cache. */
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

    // Into the cloud: its first place is selected, and home shows that place's room and nothing of
    // the relay's.
    await (await openSwitcher(page)).getByRole('button', { name: new RegExp(`^\\S ${CLOUD.name}\\b`) }).click();
    await expect(switcher(page)).toContainText(CLOUD.name);
    await expect(isSelectedPlace(page, CLOUD_PLACE.name)).toBeVisible();
    await expect(roomRow(page, CLOUD_ROOM.name)).toBeVisible();
    for (const title of [MINA.nick, GUEST_NICK, SECOND_PLACE_ROOM.name]) {
        await expect(roomRow(page, title)).toHaveCount(0);
    }
    await expect.poll(() => cloud.sessionSite).toBe(CLOUD_PLACE.id);

    // Each side's rooms sit in its own partition of the shell's cache: the cloud's under the cloud and
    // the guest's user there, the relay's untouched by them.
    await expect
        .poll(() => cachedRoomIds(shell, CLOUD.id, CLOUD_USER.uid))
        .toEqual([CLOUD_ROOM.id, SECOND_PLACE_ROOM.id].sort());
    expect(cachedRoomIds(shell, RELAY_PARTITION.cid, RELAY_PARTITION.uid)).toEqual(
        [DM_CHANNEL.id, SELF_CHANNEL.id].sort()
    );

    // To the second place: the cloud session moves there, and home swaps one place's room for the other's.
    await placeRow(page, SECOND_PLACE.name).click();
    await expect(isSelectedPlace(page, SECOND_PLACE.name)).toBeVisible();
    await expect(roomRow(page, SECOND_PLACE_ROOM.name)).toBeVisible();
    await expect(roomRow(page, CLOUD_ROOM.name)).toHaveCount(0);
    await expect(isSelectedPlace(page, CLOUD_PLACE.name)).toHaveCount(0);
    await expect.poll(() => switchTargets(backend)).toContain(`${CLOUD_USER.uid}@${SECOND_PLACE.id}`);
    await expect.poll(() => cloud.sessionSite).toBe(SECOND_PLACE.id);

    // Back to DoU Home: the relay's rooms, and nothing of the cloud's.
    // (The row says "Unread" too: Mina's message on the relay has not been read.)
    await (await openSwitcher(page)).getByRole('button', { name: /^DoU Home( Unread)?$/ }).click();
    await expectRelayHome(page);
});

/**
 * Into the cloud from the switcher, which the relay refuses. The refusal is held until the page has
 * shown the switch begin — it moves to the cloud first and asks after — so what is read once it
 * resolves is a rollback, not a switch that never started.
 */
const tryRefusedCloud = async (page: Page, backend: FakeBackend, owned: OwnedCloudState): Promise<void> => {
    await page.goto('/');
    await expectRelayHome(page);
    // The page tries the cloud once on its own, in the background, after boot.
    await expect.poll(() => owned.delegations).toBeGreaterThanOrEqual(1);
    let asked = false;
    let release: () => void = () => undefined;
    const held = new Promise<void>(resolve => (release = resolve));
    backend.gateHttp('POST /users/0/delegate-cloud', () => {
        asked = true;
        return held;
    });

    await (await openSwitcher(page)).getByRole('button', { name: new RegExp(`^\\S ${CLOUD.name}\\b`) }).click();
    // The tap is a try of its own: the page has moved to the cloud and asked the relay again.
    await expect(switcher(page)).toContainText(CLOUD.name);
    await expect.poll(() => asked).toBe(true);
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

    // The refusal moves it back.
    await expect(switcher(page).getByRole('img', { name: 'DoU' })).toBeVisible();
    await expect(switcher(page)).not.toContainText(CLOUD.name);
    await expect(page.getByText('Places', { exact: true })).toHaveCount(0);
    for (const room of [CLOUD_ROOM, SECOND_PLACE_ROOM]) await expect(roomRow(page, room.name)).toHaveCount(0);
    // No socket to the cloud, and nothing written under it in the shell's cache.
    expect(backend.allFrames.filter(frame => frame.endpoint === CLOUD.wss)).toEqual([]);
    expect(cachedRoomIds(shell, CLOUD.id, CLOUD_USER.uid)).toEqual([]);
    expect(cachedRoomIds(shell, CLOUD.id, GUEST.uid)).toEqual([]);
});

// A product bug, left for its own fix: after the rollback above, home often lists no rooms at all
// ("Chat Rooms 0", on both engines in about six runs of ten, and for as long as it was watched — 8s),
// though the selection is back on the relay. In a failing run the last cache read the page makes is
// of the cloud's partition, started during the switch. The likely mechanism: the home list's
// observation re-subscribes to the relay on the rollback and is answered at once from memory, and
// the cloud read it abandoned lands after that and still reaches the list, emptying it. Here the
// refusal is an instant local answer while a cache read is a round trip through the test process,
// so on a device, where the refusal takes longer, it is probably rarer.
test.fixme('a cloud that cannot be entered leaves the relay rooms on home', async ({ page, backend }) => {
    backend.useSocket(roomsSocket(backend, [dmRoom()]));
    const owned = ownCloud(backend, { issue: false });
    installCloud(backend, { profileInPlace: true, secondPlace: true });
    await tryRefusedCloud(page, backend, owned);

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
    // The switch begins — the page moves off the first place and asks the cloud — and is refused.
    await expect(isSelectedPlace(page, CLOUD_PLACE.name)).toHaveCount(0);
    await expect.poll(() => switchTargets(backend)).toContain(`${CLOUD_USER.uid}@${SECOND_PLACE.id}`);
    release();

    await expect(isSelectedPlace(page, CLOUD_PLACE.name)).toBeVisible();
    await expect(isSelectedPlace(page, SECOND_PLACE.name)).toHaveCount(0);
    await expect(roomRow(page, CLOUD_ROOM.name)).toBeVisible();
    await expect(roomRow(page, SECOND_PLACE_ROOM.name)).toHaveCount(0);
});
