import { myTab } from '../support/app';
import { expect, test } from '../support/test';

/**
 * The page is always the newest deploy, but the app around it is whatever build a person installed.
 * Builds up to 0.32.x declare their capabilities in the spellings from before the values were renamed
 * (`'app'` for the app doing the work), and the page has to read them as the app's: answered
 * `'browser'`, every installed phone loses the app's own sign-in, icon choice, picker and push at once.
 */
const declaredBy0322 = (platform: 'ios' | 'android') => ({
    version: 4,
    checkout: [platform === 'ios' ? 'apple' : 'google'],
    media: 'app',
    files: 'app',
    links: 'app',
    appShell: 'app',
    signIn: 'app',
    diagnostics: 'app',
    push: 'app',
});

test.describe('an installed 0.32.2 app, declaring the old spellings', () => {
    test.use({
        shellAppVersion: '0.32.2',
        shellCapabilities: async ({ shellPlatform }, use) => use(declaredBy0322(shellPlatform)),
    });

    test('signs in with the app, not the page', async ({ page, shell }) => {
        shell.handle('OAuthLogin', () => ({ result: null }));

        await page.goto('/');
        await myTab(page).click();
        await page.getByText('Sign in required').click();

        const google = page.getByRole('button', { name: 'Continue with Google' });
        await expect(google).toBeEnabled();
        await google.click();
        const request = await shell.waitFor('OAuthLogin');
        expect(request.data).toEqual({ provider: 'google' });
    });
});
