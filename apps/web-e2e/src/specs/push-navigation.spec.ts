import type { Page } from '@playwright/test';

import { GUEST_NICK, SELF_CHANNEL } from '../fixtures/guest';
import { DM_CHANNEL, DM_FIRST_MESSAGE, dmRoom, leftDmRoom, MINA, roomsSocket } from '../fixtures/rooms';
import { composer, currentPath, goBack, historyIndex, home } from '../support/app';
import type { FakeShell } from '../support/fake-shell/fakeShell';
import { expect, test } from '../support/test';

/**
 * Where a tapped push lands (apps/web/docs/bridge/push-navigation.md). The app turns a notification
 * tap into `OnNavigate { path }` with the room's route and its cloud and place in the query
 * (`resolvePushTapPath`); the bridge holds it until the page's handshake. On a cold start the page
 * keeps it until its router exists and holds the boot cover until it has navigated, so home is never
 * the first screen drawn; on a warm start it lands straight away. A room is the one screen a tap
 * replaces, so back leaves the chat instead of walking through every room tapped into.
 *
 * Every tap here is a relay message (`cid=#`), so no cloud switch runs: that branch needs a cloud
 * session, and its rules are `useHandlePushNavigation.test.ts`'s.
 */

/** The path the app hands over for a tap on a relay message in `channelId`. */
const relayPushPath = (channelId: string) => `/channels/${channelId}/room?cid=%23&sid=${SELF_CHANNEL.sid}`;

const LEFT_ROOM = leftDmRoom();

test.beforeEach(({ backend }) => {
    backend.useSocket(roomsSocket(backend, [dmRoom(), LEFT_ROOM]));
});

test('a tap that launched the app opens its room, with home underneath', async ({
    page,
    shell,
    backend,
    shellPlatform,
}) => {
    // What the page shows when the shell is told to lift its splash, read in the page at that moment.
    await page.addInitScript(() => {
        const native = (window as unknown as { ReactNativeWebView: { postMessage: (raw: string) => void } })
            .ReactNativeWebView;
        const post = native.postMessage;
        native.postMessage = raw => {
            if (String(raw).includes('"type":"FirstScreenReady"')) {
                (window as unknown as Record<string, string>)['__e2eScreenAtFirstScreenReady'] =
                    window.location.pathname;
            }
            post(raw);
        };
    });
    // The tap is in before the page exists: the bridge holds it until the handshake, as the app's does.
    shell.push('OnNavigate', { path: relayPushPath(DM_CHANNEL.id), replace: false });
    // On a device the held tap lands within milliseconds of the handshake, long before the guest login
    // answers. This shell hands it over through the test process, which can fall behind a page booting
    // on a loaded machine — so the login waits for the tap to land, keeping the device's order.
    backend.gateHttp('POST /oauth/register-device', () => shell.delivered('OnNavigate'));

    await page.goto('/');

    await expect(page.getByText(DM_FIRST_MESSAGE)).toBeVisible();
    expect(await currentPath(page)).toBe(`/channels/${DM_CHANNEL.id}/room`);
    // The splash came down over the room, not over home with the room still to come.
    const screenAtLift = await page.evaluate(
        () => (window as unknown as Record<string, string>)['__e2eScreenAtFirstScreenReady']
    );
    expect(screenAtLift).toBe(`/channels/${DM_CHANNEL.id}/room`);

    // The shell loaded home before the tap arrived, so back leaves the room for it.
    await goBack(page, shell, shellPlatform);
    await expect(home(page)).toBeVisible();
    expect(await historyIndex(page)).toBe(0);
});

test('a tap while the app is open leaves the room on screen for the tapped one', async ({
    page,
    shell,
    shellPlatform,
}) => {
    await page.goto('/');
    await page.getByText(GUEST_NICK).first().click();
    await expect(composer(page)).toBeVisible();
    const depthInSelfChat = await historyIndex(page);

    shell.push('OnNavigate', { path: relayPushPath(DM_CHANNEL.id), replace: false });

    await expect(page.getByText(DM_FIRST_MESSAGE)).toBeVisible();
    expect(await currentPath(page)).toBe(`/channels/${DM_CHANNEL.id}/room`);
    // Replaced, not stacked: rooms are peers a tap hops between.
    expect(await historyIndex(page)).toBe(depthInSelfChat);

    // A second tap on the room already open is not a second entry for it. Counted, not waited for:
    // the first tap logged the same line, and a wait would be satisfied by that one.
    const requested = () =>
        shell
            .received('SendLog')
            .filter(m => (m.data.message ?? '').includes(`Push navigation requested: ${relayPushPath(DM_CHANNEL.id)}`))
            .length;
    const before = requested();
    shell.push('OnNavigate', { path: relayPushPath(DM_CHANNEL.id), replace: false });
    await expect.poll(requested).toBe(before + 1);
    expect(await historyIndex(page)).toBe(depthInSelfChat);

    await goBack(page, shell, shellPlatform);
    await expect(home(page)).toBeVisible();
    await expect(page.getByText(MINA.nick).first()).toBeVisible();
    expect(await historyIndex(page)).toBe(0);
});

/**
 * From home, a tap into a 1:1 the guest has since left — the push outlived the membership. The relay
 * still serves the room; the page reads the departure off the room's own row and closes it.
 */
const tapIntoLeftRoom = async (page: Page, shell: FakeShell): Promise<void> => {
    await page.goto('/');
    await expect(home(page)).toBeVisible();
    shell.push('OnNavigate', { path: relayPushPath(LEFT_ROOM.channel.id), replace: false });
    await expect(page.getByText("You're not in this conversation.", { exact: true })).toBeVisible();
    await expect.poll(() => currentPath(page)).toBe('/');
};

test('a tap into a room the guest has left says so and lands on home', async ({ page, shell }) => {
    await tapIntoLeftRoom(page, shell);

    await expect(home(page)).toBeVisible();
    await expect(page.getByText(MINA.nick).first()).toBeVisible();
});

// The tap PUSHED the room above the home the guest was on, so the room leaves by rewinding onto that
// home. Overwriting the room with home instead left home above home, and the first back press
// rewound into an identical screen and looked like it did nothing.
test('a tap into a room the guest has left leaves one home entry, not two', async ({ page, shell }) => {
    await tapIntoLeftRoom(page, shell);

    expect(await historyIndex(page)).toBe(0);
});
