import type { Page } from '@playwright/test';

import type { FakeBackend } from '../../fixtures/backend';
import { CLOUD, CLOUD_ROOM, installCloud, ownCloud } from '../../fixtures/cloud';
import { GUEST, GUEST_NICK } from '../../fixtures/guest';
import { DM_FIRST_MESSAGE, dmRoom, MINA, roomsSocket } from '../../fixtures/rooms';
import { installSubscriptions, signedInMember } from '../../fixtures/subscription';
import { composer, home, myTab, roomRow } from '../../support/app';
import type { FakeShell } from '../../support/fake-shell/fakeShell';
import { expect, test } from '../../support/test';

test.use({ timezoneId: 'Asia/Seoul', locale: 'en-US' });

const NOW = new Date(GUEST.createdAt + 26 * 60 * 60 * 1000);

test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(NOW);
});

const roomSynced = (shell: FakeShell) =>
    shell.waitFor('StopPerfTrace', message => message.data.name === 'chat_room_sync');

const quiet = async (page: Page, backend: FakeBackend): Promise<void> => {
    let last = -1;
    let stableSince = Date.now();
    await expect
        .poll(
            () => {
                const now = backend.allFrames.length + backend.httpRequests;
                if (now !== last) {
                    last = now;
                    stableSince = Date.now();
                }
                return Date.now() - stableSince;
            },
            { timeout: 20_000, intervals: [100] }
        )
        .toBeGreaterThanOrEqual(1_000);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
};

const snap = async (page: Page, backend: FakeBackend, name: string, { soft = false } = {}): Promise<void> => {
    await quiet(page, backend);
    await (soft ? expect.soft(page) : expect(page)).toHaveScreenshot(`${name}.png`);
};

test('home on the relay', { tag: '@visual' }, async ({ page, backend }) => {
    backend.useSocket(roomsSocket(backend, [dmRoom()]));
    await page.goto('/');
    await expect(roomRow(page, MINA.nick)).toBeVisible();
    await expect(roomRow(page, GUEST_NICK)).toBeVisible();
    await expect(page.getByText(DM_FIRST_MESSAGE)).toBeVisible();
    await snap(page, backend, 'relay-home');
});

test('a 1:1 with history', { tag: '@visual' }, async ({ page, shell, backend }) => {
    backend.useSocket(roomsSocket(backend, [dmRoom()]));
    await page.goto('/');
    await roomRow(page, MINA.nick).click();
    await expect(page.getByText(DM_FIRST_MESSAGE)).toBeVisible();
    await roomSynced(shell);
    await snap(page, backend, 'dm-room');
});

test('the empty self chat', { tag: '@visual' }, async ({ page, shell, backend }) => {
    await page.goto('/');
    await roomRow(page, GUEST_NICK).click();
    await expect(composer(page)).toBeVisible();
    await roomSynced(shell);
    await snap(page, backend, 'self-chat');
});

test('MY', { tag: '@visual' }, async ({ page, backend }) => {
    await page.goto('/');
    await expect(home(page)).toBeVisible();
    await myTab(page).click();
    await expect(page.getByText('Sign in required')).toBeVisible();
    await snap(page, backend, 'my');
});

test('the cloud switcher and a cloud home', { tag: '@visual' }, async ({ page, backend }) => {
    backend.useSocket(roomsSocket(backend, [dmRoom()]));
    ownCloud(backend);
    installCloud(backend, { profileInPlace: true, secondPlace: true });
    await page.goto('/');
    await expect(roomRow(page, MINA.nick)).toBeVisible();
    await expect.poll(() => backend.sentAt(CLOUD.wss, 'channel.sync').length).toBeGreaterThan(0);

    const switcher = page.getByRole('banner').getByRole('button', { name: 'Switch Cloud', exact: true });
    await switcher.click();
    const dialog = page.getByRole('dialog', { name: 'Switch Cloud' });
    const entry = dialog.getByRole('button', { name: new RegExp(`^\\S ${CLOUD.name}\\b`) });
    await expect(entry).toBeVisible();
    await snap(page, backend, 'cloud-switcher', { soft: true });

    await entry.click();
    await expect(dialog).toHaveCount(0);
    await expect(roomRow(page, CLOUD_ROOM.name)).toBeVisible();
    await snap(page, backend, 'cloud-home');
});

test('the subscription guide', { tag: '@visual' }, async ({ page, backend }) => {
    signedInMember(backend);
    installSubscriptions(backend, 'ios');
    await page.goto('/');
    await myTab(page).click();
    await page.getByRole('button', { name: 'Subscription', exact: true }).click();
    await page.getByRole('button', { name: 'Subscribe', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Get started', exact: true })).toBeVisible();
    await snap(page, backend, 'subscription-guide');
});

test.describe('an app below the version floor', () => {
    test.use({ shellAppVersion: '0.29.2' });

    test('the update screen', { tag: '@visual' }, async ({ page, backend }) => {
        await page.goto('/');
        await expect(page.getByRole('heading', { name: 'Please update the app' })).toBeVisible();
        await snap(page, backend, 'update-required');
    });
});
