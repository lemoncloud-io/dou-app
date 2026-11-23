import type { Page } from '@playwright/test';

import type { GoogleOAuthTokenResult } from '@chatic/bridge-messages';

import { registerDeviceAnswer } from '../fixtures/guest';
import { myTab } from '../support/app';
import { ShellFailure } from '../support/fake-shell/handlerTable';
import { expect, test } from '../support/test';

const googleCredential = (platform: GoogleOAuthTokenResult['platform']): GoogleOAuthTokenResult => ({
    platform,
    provider: 'google',
    idToken: 'e2e-google-id-token',
    accessToken: 'e2e-google-access-token',
});

const googleButton = (page: Page) => page.getByRole('button', { name: 'Continue with Google' });

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
    await expect.poll(() => verified).toMatchObject({ idToken: 'e2e-google-id-token' });
    await expect(page.getByText('Subscription')).toBeVisible();
    await expect(page.getByText('Sign in required')).toHaveCount(0);
});

test('a relay code from the virtual shell is exchanged and promotes the guest', async ({
    page,
    shell,
    backend,
    shellPlatform,
}) => {
    shell.handle('OAuthLogin', () => ({
        result: { provider: 'google', platform: shellPlatform, code: 'e2e-relay-code' },
    }));
    let exchanged: unknown;
    backend.useHttp({
        'POST /users/0/verify-oauth-code': request => {
            exchanged = request.postDataJSON();
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

    await expect.poll(() => exchanged).toEqual({ provider: 'google', code: 'e2e-relay-code' });
    await expect(page.getByText('Subscription')).toBeVisible();
    await expect(page.getByText('Sign in required')).toHaveCount(0);
    expect(backend.unexpected.filter(entry => entry.includes('verify-native-token'))).toEqual([]);
});

test('a sign-in cancelled in the app says so and leaves the buttons usable', async ({ page, shell }) => {
    shell.handle('OAuthLogin', () => ({ result: null }));

    await openSignIn(page);
    await googleButton(page).click();

    await expect(page.getByText('Social login failed.', { exact: true })).toBeVisible();
    await expect(googleButton(page)).toBeEnabled();
});

test('a sign-in the app fails says so and leaves the buttons usable', async ({ page, shell, backend }) => {
    shell.handle('OAuthLogin', () => new ShellFailure('OAUTH_LOGIN_ERROR', 'DEVELOPER_ERROR'));

    await openSignIn(page);
    await googleButton(page).click();

    await expect(page.getByText('Sign in failed', { exact: true })).toBeVisible();
    await expect(googleButton(page)).toBeEnabled();
    expect(backend.unexpected.filter(entry => entry.includes('verify-native-token'))).toEqual([]);
});
