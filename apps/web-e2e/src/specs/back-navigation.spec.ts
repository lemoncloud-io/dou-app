import { GUEST_NICK, SELF_CHANNEL } from '../fixtures/guest';
import { pendingRelayInvite, relayInvitePath } from '../fixtures/invites';
import { composer, currentPath, goBack, historyIndex, home, pressBack } from '../support/app';
import type { FakeShell } from '../support/fake-shell/fakeShell';
import { expect, test } from '../support/test';

const lastCanGoBack = (shell: FakeShell) => shell.received('SetCanGoBack').at(-1)?.data.canGoBack;
const lastIncludesHistory = (shell: FakeShell) => shell.received('SetCanGoBack').at(-1)?.data.includesHistory;

test('back closes the open overlay first, then leaves the room for home', async ({ page, shell, shellPlatform }) => {
    test.skip(shellPlatform !== 'android', 'the back button is Android-only');
    await page.goto('/');
    await expect.poll(() => lastCanGoBack(shell)).toBe(false);
    await page.getByText(GUEST_NICK).first().click();
    await expect(composer(page)).toBeVisible();
    await expect.poll(() => lastCanGoBack(shell)).toBe(true);
    expect(lastIncludesHistory(shell)).toBe(true);

    await page.getByRole('button', { name: 'Open attachments' }).click();
    const menu = page.getByRole('dialog');
    await expect(menu).toBeVisible();
    await expect.poll(() => lastCanGoBack(shell)).toBe(true);

    pressBack(shell);
    await expect(menu).toBeHidden();
    await expect(composer(page)).toBeVisible();
    await expect.poll(() => lastCanGoBack(shell)).toBe(true);

    pressBack(shell);
    await expect(home(page)).toBeVisible();
    expect(await historyIndex(page)).toBe(0);
    await expect.poll(() => lastCanGoBack(shell)).toBe(false);
});

test('back on the app first screen is not spent', async ({ page, shell, shellPlatform }) => {
    test.skip(shellPlatform !== 'android', 'the back button is Android-only');
    await page.goto('/');
    await expect(home(page)).toBeVisible();
    expect(await historyIndex(page)).toBe(0);

    pressBack(shell);
    shell.push('OnNavigate', { path: `/channels/${SELF_CHANNEL.id}/room`, replace: false });
    await expect(composer(page)).toBeVisible();
    expect(await historyIndex(page)).toBe(1);

    pressBack(shell);
    await expect(home(page)).toBeVisible();
    expect(await currentPath(page)).toBe('/');
    expect(await historyIndex(page)).toBe(0);
});

test('an invite link that launched the app sits above home, and back returns there', async ({
    page,
    shell,
    backend,
    shellPlatform,
}) => {
    backend.useSocket({ 'invite.get': () => pendingRelayInvite() });
    shell.push('OnNavigate', { path: relayInvitePath(), replace: false });

    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Mina invited you to DoU' })).toBeVisible();
    expect(await currentPath(page)).toMatch(/^\/invite\/accept\?/);
    expect(await historyIndex(page)).toBe(1);

    await goBack(page, shell, shellPlatform);
    await expect(home(page)).toBeVisible();
    expect(await currentPath(page)).toBe('/');
    expect(await historyIndex(page)).toBe(0);
    await expect(page.getByText(GUEST_NICK).first()).toBeVisible();
});
