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
const tryRefusedCloud = async (
    page: Page,
    backend: FakeBackend,
    owned: OwnedCloudState,
    {
        beforeTap,
        beforeRefusal,
    }: {
        /** Runs just before the tap that starts the switch. */
        beforeTap?: () => void;
        /** Runs once the switch has begun, and the refusal waits for it. */
        beforeRefusal?: () => Promise<void>;
    } = {}
): Promise<void> => {
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
    beforeTap?.();

    await (await openSwitcher(page)).getByRole('button', { name: new RegExp(`^\\S ${CLOUD.name}\\b`) }).click();
    // The tap is a try of its own: the page has moved to the cloud and asked the relay again.
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

/**
 * Holds the shell's answer to the channel-list reads of the cloud's partition, from `arm()` until
 * `release()`.
 *
 * Entering the cloud points home's room list at the cloud's partition, and its first read there is
 * a round trip through the shell. If the switch is refused before that read comes back, the list
 * moves back to the relay and is answered from memory at once — and the cloud's read, landing after
 * that, used to reach the list anyway and empty it. Left to timing that ordering showed up in some
 * runs and not others; holding the read makes it happen every time.
 */
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
        // The cloud's read is out before the switch is refused, not started by something afterwards.
        beforeRefusal: () => expect.poll(() => cloudReads.reads.held).toBeGreaterThan(0),
    });

    // Rolled back, with the cloud's read still out: the relay's rooms are back.
    await expectRelayHome(page);

    // The read the switch abandoned lands now, and changes nothing on home. The answer is in the
    // page a moment after the shell builds it, and the list renders a task later; past both, the
    // rows are counted once rather than waited for — a retrying check would pass on the list as it
    // was before the stale answer arrived.
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
    // The switch begins — the page moves off the first place and asks the cloud — and is refused.
    await expect(isSelectedPlace(page, CLOUD_PLACE.name)).toHaveCount(0);
    await expect.poll(() => switchTargets(backend)).toContain(`${CLOUD_USER.uid}@${SECOND_PLACE.id}`);
    release();

    await expect(isSelectedPlace(page, CLOUD_PLACE.name)).toBeVisible();
    await expect(isSelectedPlace(page, SECOND_PLACE.name)).toHaveCount(0);
    await expect(roomRow(page, CLOUD_ROOM.name)).toBeVisible();
    await expect(roomRow(page, SECOND_PLACE_ROOM.name)).toHaveCount(0);
});

/**
 * The page keeps a socket session in every joined cloud, so by the time the person taps the cloud its
 * socket is usually up and signed in already. The switch then only moves the pointer: nothing
 * reconnects and nothing signs in again, and a cloud switch leaves no place selected. When the device
 * holds no places for that cloud, nothing is there to auto-select either — the page used to sit on an
 * empty home until the next minute-long poll asked again.
 *
 * Here the cloud answers its place list empty until the tap, as a session that is not ready does, so
 * the background loop caches nothing; only an ask made because of the switch can bring the places.
 */
test('entering a cloud whose socket is already up asks it for its lists at once', async ({ page, backend }) => {
    backend.useSocket(roomsSocket(backend, [dmRoom()]));
    ownCloud(backend);
    installCloud(backend, { profileInPlace: true, secondPlace: true });
    let tapped = false;
    backend.useSocketAt(CLOUD.wss, {
        'user.my-site': () =>
            tapped
                ? {
                      list: [CLOUD_PLACE, SECOND_PLACE].map(place => ({
                          id: place.id,
                          name: place.name,
                          isOwner: false,
                          createdAt: GUEST.createdAt,
                      })),
                      total: 2,
                  }
                : { list: [], total: 0 },
    });

    await page.goto('/');
    await expectRelayHome(page);
    // The cloud's socket comes up in the background and signs in, and the background loop asks for
    // its places — and is told there are none — before anyone taps it.
    await expect.poll(() => backend.sentAt(CLOUD.wss, 'auth.update').length).toBeGreaterThanOrEqual(1);
    const placeAsks = () => backend.sentAt(CLOUD.wss, 'user.my-site').length;
    await expect.poll(placeAsks).toBeGreaterThanOrEqual(1);
    const before = placeAsks();

    tapped = true;
    await (await openSwitcher(page)).getByRole('button', { name: new RegExp(`^\\S ${CLOUD.name}\\b`) }).click();
    await expect(switcher(page)).toContainText(CLOUD.name);

    // Well inside the background loop's tick and the minute-long poll: only the switch can have asked.
    await expect.poll(placeAsks, { timeout: 5_000 }).toBeGreaterThan(before);
    await expect(isSelectedPlace(page, CLOUD_PLACE.name)).toBeVisible({ timeout: 5_000 });
    await expect(roomRow(page, CLOUD_ROOM.name)).toBeVisible();
    // The pointer moved onto the slot that was up; the cloud was not signed in to a second time.
    expect(backend.sentAt(CLOUD.wss, 'auth.update')).toHaveLength(1);
});

/**
 * The way back. Leaving the cloud brings the relay and its selected place back a render before the
 * socket pointer follows, and two of the page's refresh triggers each used to claim that arrival — a
 * second full pass over the same channel cursor for nothing.
 */
test('returning to DoU Home asks the relay for its lists once', async ({ page, backend }) => {
    backend.useSocket(roomsSocket(backend, [dmRoom()]));
    ownCloud(backend);
    installCloud(backend, { profileInPlace: true, secondPlace: true });

    await page.goto('/');
    await expectRelayHome(page);
    await (await openSwitcher(page)).getByRole('button', { name: new RegExp(`^\\S ${CLOUD.name}\\b`) }).click();
    await expect(isSelectedPlace(page, CLOUD_PLACE.name)).toBeVisible();
    // Let the cloud's own arrival settle, so what is counted below is the way back alone.
    await page.waitForTimeout(1_000);
    const before = backend.sent('channel.sync').length;

    await (await openSwitcher(page)).getByRole('button', { name: /^DoU Home( Unread)?$/ }).click();
    await expectRelayHome(page);
    await expect.poll(() => backend.sent('channel.sync').length - before).toBe(1);
    // Long enough for a second pass to land, far short of the minute-long poll.
    await page.waitForTimeout(2_000);
    expect(backend.sent('channel.sync').length - before).toBe(1);
});
