import type { Page } from '@playwright/test';

import { GUEST_NICK, SELF_CHANNEL } from '../fixtures/guest';
import { DM_CHANNEL, DM_FIRST_MESSAGE, dmRoom, leftDmRoom, MINA, roomsSocket } from '../fixtures/rooms';
import { composer, currentPath, goBack, historyIndex, home } from '../support/app';
import type { FakeShell } from '../support/fake-shell/fakeShell';
import { expect, test } from '../support/test';

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
    shell.push('OnNavigate', { path: relayPushPath(DM_CHANNEL.id), replace: false });
    backend.gateHttp('POST /oauth/register-device', () => shell.delivered('OnNavigate'));

    await page.goto('/');

    await expect(page.getByText(DM_FIRST_MESSAGE)).toBeVisible();
    expect(await currentPath(page)).toBe(`/channels/${DM_CHANNEL.id}/room`);
    const screenAtLift = await page.evaluate(
        () => (window as unknown as Record<string, string>)['__e2eScreenAtFirstScreenReady']
    );
    expect(screenAtLift).toBe(`/channels/${DM_CHANNEL.id}/room`);

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
    expect(await historyIndex(page)).toBe(depthInSelfChat);

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

test('a tap into a room the guest has left leaves one home entry, not two', async ({ page, shell }) => {
    await tapIntoLeftRoom(page, shell);

    expect(await historyIndex(page)).toBe(0);
});
