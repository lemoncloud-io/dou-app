import { GUEST_NICK, SELF_CHANNEL } from '../fixtures/guest';
import { pendingRelayInvite, relayInvitePath } from '../fixtures/invites';
import { composer, currentPath, goBack, historyIndex, home, pressBack } from '../support/app';
import type { FakeShell } from '../support/fake-shell/fakeShell';
import { expect, test } from '../support/test';

/**
 * The Android back button inside the app (`useBackHandler`, `navigation/useStackBack`, and the shell's
 * `useAndroidBack`). The page tells the shell (`SetCanGoBack`, marked `includesHistory`) whether a
 * press is its own to spend — an overlay is open, or the app has an entry behind the current screen —
 * and the shell forwards a press as `OnBackPressed` on that answer alone. The page spends a press on
 * the topmost overlay first, then on one history entry; on the app's first entry with nothing open the
 * press is the shell's, so back never walks into a screen from before the app loaded.
 *
 * The press itself is Android's: the iOS shell never sends `OnBackPressed`, and back there is the
 * WebView's own swipe through its history. So the scenarios about how a press is spent run on the
 * Android project only, and the one about where back lands runs on both.
 */

/** The page's latest answer to "is this press mine to spend", as the shell last heard it. */
const lastCanGoBack = (shell: FakeShell) => shell.received('SetCanGoBack').at(-1)?.data.canGoBack;
/** Whether that answer covers the page's history too, so the shell decides from it alone. */
const lastIncludesHistory = (shell: FakeShell) => shell.received('SetCanGoBack').at(-1)?.data.includesHistory;

test('back closes the open overlay first, then leaves the room for home', async ({ page, shell, shellPlatform }) => {
    test.skip(shellPlatform !== 'android', 'the back button is Android-only');
    await page.goto('/');
    await expect.poll(() => lastCanGoBack(shell)).toBe(false);
    await page.getByText(GUEST_NICK).first().click();
    await expect(composer(page)).toBeVisible();
    // The room sits one entry above home, so the press is the page's even with nothing open.
    await expect.poll(() => lastCanGoBack(shell)).toBe(true);
    expect(lastIncludesHistory(shell)).toBe(true);

    // An overlay opens: the page claims the next press for it.
    await page.getByRole('button', { name: 'Open attachments' }).click();
    const menu = page.getByRole('dialog');
    await expect(menu).toBeVisible();
    await expect.poll(() => lastCanGoBack(shell)).toBe(true);

    pressBack(shell);
    await expect(menu).toBeHidden();
    // The press went to the overlay, not to history.
    await expect(composer(page)).toBeVisible();
    await expect.poll(() => lastCanGoBack(shell)).toBe(true);

    pressBack(shell);
    await expect(home(page)).toBeVisible();
    expect(await historyIndex(page)).toBe(0);
    // Back on the first screen with nothing open, the next press is the shell's.
    await expect.poll(() => lastCanGoBack(shell)).toBe(false);
});

test('back on the app first screen is not spent', async ({ page, shell, shellPlatform }) => {
    test.skip(shellPlatform !== 'android', 'the back button is Android-only');
    await page.goto('/');
    await expect(home(page)).toBeVisible();
    expect(await historyIndex(page)).toBe(0);

    pressBack(shell);
    // The shell delivers events in order, so once a tap sent after the press has landed, the press
    // has been handled. Had it rewound past the app's first entry, the page would have left the app
    // and the tap would land nowhere; had it been spent on history, the room would not sit at 1.
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
    // The link is in before the page exists, as when the app is launched by it.
    shell.push('OnNavigate', { path: relayInvitePath(), replace: false });

    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Mina invited you to DoU' })).toBeVisible();
    expect(await currentPath(page)).toMatch(/^\/invite\/accept\?/);
    // One entry above the home the shell loaded first — not the first entry, and not two up.
    expect(await historyIndex(page)).toBe(1);

    await goBack(page, shell, shellPlatform);
    await expect(home(page)).toBeVisible();
    expect(await currentPath(page)).toBe('/');
    expect(await historyIndex(page)).toBe(0);
    await expect(page.getByText(GUEST_NICK).first()).toBeVisible();
});
