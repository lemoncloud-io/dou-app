import type { Page } from '@playwright/test';

import type { GoogleOAuthTokenResult } from '@chatic/app-messages';

import { registerDeviceAnswer } from '../fixtures/guest';
import { myTab } from '../support/app';
import { ShellFailure } from '../support/fake-shell/handlerTable';
import { expect, test } from '../support/test';

/**
 * Social sign-in inside the app (`LoginPage`, and the shell's `useOAuthHandler`). The page posts
 * `OAuthLogin` and waits on no timer — the provider's screens belong to the person for as long as
 * they take — and the shell answers `OnOAuthLogin` once: the credential, `result: null` for a cancel,
 * or `success: false` for a failure. Each answer has to end the wait, or the screen stays disabled
 * with a spinner and no way out.
 */

/** A Google credential as the app's OAuth service hands it over. Invented; nothing verifies it here. */
const googleCredential = (platform: GoogleOAuthTokenResult['platform']): GoogleOAuthTokenResult => ({
    platform,
    provider: 'google',
    idToken: 'e2e-google-id-token',
    accessToken: 'e2e-google-access-token',
});

const googleButton = (page: Page) => page.getByRole('button', { name: 'Continue with Google' });

/** From home to the sign-in screen, the way a guest gets there: MY → "Sign in required". */
const openSignIn = async (page: Page): Promise<void> => {
    await page.goto('/');
    await myTab(page).click();
    await page.getByText('Sign in required').click();
    await expect(googleButton(page)).toBeEnabled();
};

test('a Google sign-in the app completes promotes the guest and returns to MY', async ({
    page,
    shell,
    backend,
    shellPlatform,
}) => {
    shell.handle('OAuthLogin', () => ({ result: googleCredential(shellPlatform) }));
    let verified: unknown;
    backend.useHttp({
        'POST /users/0/verify-native-token': request => {
            verified = request.postDataJSON();
            const answer = registerDeviceAnswer(backend.deviceId);
            return {
                ...answer,
                userRole: 'user',
                account$: { id: answer.accountId, stereo: 'google', name: 'guest@example.test' },
            };
        },
    });

    await openSignIn(page);
    await googleButton(page).click();

    const request = await shell.waitFor('OAuthLogin');
    expect(request.data).toEqual({ provider: 'google' });
    // The credential went to the relay as the app returned it.
    await expect.poll(() => verified).toMatchObject({ idToken: 'e2e-google-id-token' });
    // Back where the guest came from, no longer a guest: the sign-in prompt has gone.
    await expect(page.getByText('Subscription')).toBeVisible();
    await expect(page.getByText('Sign in required')).toHaveCount(0);
});

test('a sign-in cancelled in the app says so and leaves the buttons usable', async ({ page, shell }) => {
    shell.handle('OAuthLogin', () => ({ result: null }));

    await openSignIn(page);
    await googleButton(page).click();

    await expect(page.getByText('Social login failed.', { exact: true })).toBeVisible();
    // Still on the sign-in screen, and it can be tried again.
    await expect(googleButton(page)).toBeEnabled();
});

test('a sign-in the app fails says so and leaves the buttons usable', async ({ page, shell, backend }) => {
    shell.handle('OAuthLogin', () => new ShellFailure('OAUTH_LOGIN_ERROR', 'DEVELOPER_ERROR'));

    await openSignIn(page);
    await googleButton(page).click();

    await expect(page.getByText('Sign in failed', { exact: true })).toBeVisible();
    await expect(googleButton(page)).toBeEnabled();
    // Nothing reached the relay: there was no credential to verify.
    expect(backend.unexpected.filter(entry => entry.includes('verify-native-token'))).toEqual([]);
});
