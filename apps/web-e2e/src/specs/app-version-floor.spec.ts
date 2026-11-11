import { expect, test } from '../support/test';

/**
 * The version floor (apps/web/docs/feature/appUpdate/README.md § The floor). A phone app older than
 * the oldest one the web runs in gets the update screen and nothing else, and the Update button opens
 * the store.
 */
test.describe('an app below the version floor', () => {
    test.use({ shellAppVersion: '0.29.2' });

    test('sees only the update screen, and Update opens the store', async ({ page, shell }) => {
        await page.goto('/');

        await expect(page.getByRole('heading', { name: 'Please update the app' })).toBeVisible();
        await expect(page.getByPlaceholder('Enter a message')).toHaveCount(0);
        // The boot cover is lifted for this screen, as for any first screen.
        await shell.waitFor('FirstScreenReady');

        await page.getByRole('button', { name: 'Update' }).click();
        await shell.waitFor('OpenStore');
    });
});

test('an app at the floor opens as usual', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Please update the app' })).toHaveCount(0);
    await expect(page.getByRole('navigation')).toBeVisible();
});
