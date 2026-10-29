import type { Page } from '@playwright/test';

import { installPairing, PAIRED_ACCOUNT, pairedSession, relayApproval } from '../fixtures/pairing';
import { myTab } from '../support/app';
import { expect, test } from '../support/test';

/**
 * Signing in with another device, from the device that asks (`PairingCodePage`, and the runtime's
 * `usePairingRequest`). The page asks the relay for a code, shows it with its QR, and polls `claim`
 * until the approving device has answered. A relay approval's session rides the first `approved`
 * answer only, so the polling must never have two claims on the wire at once, and applying the
 * session has to move the socket to the account on the same connection.
 */

const codeOnScreen = (page: Page) => page.getByTestId('pairing-code');

/** From home to the code screen, the way a guest gets there: MY → "Sign in required" → another device. */
const openCodeScreen = async (page: Page): Promise<void> => {
    await page.goto('/');
    await myTab(page).click();
    await page.getByText('Sign in required').click();
    await page.getByRole('button', { name: 'Sign in with another device' }).click();
};

test('a code the app approves signs this device in as that account and returns to MY', async ({
    page,
    backend,
    shellPlatform,
}) => {
    // The first claim waits for the approval; the second carries it. Each claim takes the relay
    // longer than the polling interval, so a claim sent without waiting for the last would overlap.
    const pairing = installPairing(backend, {
        claim: index => (index === 1 ? { status: 'pending' } : relayApproval(backend)),
        claimDelayMs: 1_500,
    });

    await openCodeScreen(page);

    await expect(codeOnScreen(page)).toHaveText('0734-4168');
    await expect(page.getByTestId('pairing-qr')).toBeVisible();
    await expect(page.getByTestId('pairing-remaining')).toBeVisible();
    // Asked as this guest, for a web sign-in, naming the device the way the approval screen shows it.
    expect(pairing.requests).toEqual([
        {
            purpose: 'web',
            deviceId: backend.deviceId,
            client:
                shellPlatform === 'ios'
                    ? { name: 'iPhone', platform: 'ios' }
                    : { name: 'Android', platform: 'android' },
        },
    ]);

    // Two claims at 1.5s each, a second apart: the approval lands some 5s after the code is shown.
    await expect(page.getByText(`Signed in as ${PAIRED_ACCOUNT.approverName}`, { exact: true })).toBeVisible({
        timeout: 15_000,
    });
    // A phone signed in this way is told it is a secondary device.
    await expect(
        page.getByText(
            'This device is a secondary device of the one that approved it. Signing out there signs this device out too',
            { exact: true }
        )
    ).toBeVisible();
    // Back where the guest came from, no longer a guest: the sign-in prompt has gone.
    await expect(page.getByText('Subscription')).toBeVisible();
    await expect(page.getByText('Sign in required')).toHaveCount(0);

    // One claim at a time, and none after the one that carried the session.
    expect(pairing.claims).toEqual(['e2e-pairing-1', 'e2e-pairing-1']);
    expect(pairing.maxInFlight).toBe(1);

    // The socket followed on the connection it was on: the guest signed out, the account signed in.
    const logout = backend.sent('auth.logout');
    expect(logout).toHaveLength(1);
    const updates = backend.sent('auth.update');
    const after = updates.filter(frame => backend.frames.indexOf(frame) > backend.frames.indexOf(logout[0]));
    expect(after).toHaveLength(1);
    expect(after[0].connection).toBe(logout[0].connection);
    expect(JSON.stringify(after[0].data)).toContain(pairedSession(backend.deviceId).Token.identityToken);
});

test('a code that expired says so, and a new code can be asked for and is shown', async ({ page, backend }) => {
    // The first code's claim finds it expired; the second code waits for an approval that never comes.
    const pairing = installPairing(backend, {
        claim: (_, pairingId) => (pairingId === 'e2e-pairing-1' ? { status: 'expired' } : { status: 'pending' }),
    });

    await openCodeScreen(page);
    await expect(codeOnScreen(page)).toHaveText('0734-4168');

    await expect(page.getByText('This code has expired')).toBeVisible();
    // The old code stays on screen, struck through, so it is not mistaken for a live one.
    await expect(codeOnScreen(page)).toHaveText('0734-4168');
    await expect(codeOnScreen(page)).toHaveCSS('text-decoration-line', 'line-through');
    await expect(page.getByTestId('pairing-remaining')).toHaveCount(0);

    await page.getByRole('button', { name: 'Get a new code' }).click();

    await expect(codeOnScreen(page)).toHaveText('5219-0837');
    await expect(codeOnScreen(page)).not.toHaveCSS('text-decoration-line', 'line-through');
    await expect(page.getByTestId('pairing-remaining')).toBeVisible();
    await expect(page.getByText('This code has expired')).toHaveCount(0);
    expect(pairing.requests).toHaveLength(2);
    // The new code is the one being polled now.
    await expect.poll(() => pairing.claims.at(-1)).toBe('e2e-pairing-2');
});
