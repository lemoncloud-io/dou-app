import type { Page } from '@playwright/test';

import { installPairing, PAIRED_ACCOUNT, pairedSession, relayApproval } from '../fixtures/pairing';
import { myTab } from '../support/app';
import { expect, test } from '../support/test';

const codeOnScreen = (page: Page) => page.getByTestId('pairing-code');

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
    const pairing = installPairing(backend, {
        claim: index => (index === 1 ? { status: 'pending' } : relayApproval(backend)),
        claimDelayMs: 1_500,
    });

    await openCodeScreen(page);

    await expect(codeOnScreen(page)).toHaveText('0734-4168');
    await expect(page.getByTestId('pairing-qr')).toBeVisible();
    await expect(page.getByTestId('pairing-remaining')).toBeVisible();
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

    await expect(page.getByText(`Signed in as ${PAIRED_ACCOUNT.approverName}`, { exact: true })).toBeVisible({
        timeout: 15_000,
    });
    await expect(
        page.getByText(
            'This device is a secondary device of the one that approved it. Signing out there signs this device out too',
            { exact: true }
        )
    ).toBeVisible();
    await expect(page.getByText('Subscription')).toBeVisible();
    await expect(page.getByText('Sign in required')).toHaveCount(0);

    expect(pairing.claims).toEqual(['e2e-pairing-1', 'e2e-pairing-1']);
    expect(pairing.maxInFlight).toBe(1);

    const logout = backend.sent('auth.logout');
    expect(logout).toHaveLength(1);
    const updates = backend.sent('auth.update');
    const after = updates.filter(frame => backend.frames.indexOf(frame) > backend.frames.indexOf(logout[0]));
    expect(after).toHaveLength(1);
    expect(after[0].connection).toBe(logout[0].connection);
    expect(JSON.stringify(after[0].data)).toContain(pairedSession(backend.deviceId).Token.identityToken);
});

test('a code that expired says so, and a new code can be asked for and is shown', async ({ page, backend }) => {
    const pairing = installPairing(backend, {
        claim: (_, pairingId) => (pairingId === 'e2e-pairing-1' ? { status: 'expired' } : { status: 'pending' }),
    });

    await openCodeScreen(page);
    await expect(codeOnScreen(page)).toHaveText('0734-4168');

    await expect(page.getByText('This code has expired')).toBeVisible();
    await expect(codeOnScreen(page)).toHaveText('0734-4168');
    await expect(codeOnScreen(page)).toHaveCSS('text-decoration-line', 'line-through');
    await expect(page.getByTestId('pairing-remaining')).toHaveCount(0);

    await page.getByRole('button', { name: 'Get a new code' }).click();

    await expect(codeOnScreen(page)).toHaveText('5219-0837');
    await expect(codeOnScreen(page)).not.toHaveCSS('text-decoration-line', 'line-through');
    await expect(page.getByTestId('pairing-remaining')).toBeVisible();
    await expect(page.getByText('This code has expired')).toHaveCount(0);
    expect(pairing.requests).toHaveLength(2);
    await expect.poll(() => pairing.claims.at(-1)).toBe('e2e-pairing-2');
});
