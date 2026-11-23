import { expect, test } from '../support/test';

test.describe('an app below the version floor', () => {
    test.use({ shellAppVersion: '0.29.2' });

    test('sees only the update screen, and Update opens the store', async ({ page, shell }) => {
        await page.goto('/');

        await expect(page.getByRole('heading', { name: 'Please update the app' })).toBeVisible();
        await expect(page.getByPlaceholder('Enter a message')).toHaveCount(0);
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
