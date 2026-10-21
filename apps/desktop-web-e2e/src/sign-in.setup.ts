import { expect, test as setup, type Page } from '@playwright/test';

import { MAIN_ACCOUNT, type Account } from './support/env';
import { saveSession } from './support/test';

/**
 * Signs the account in once and keeps what a scenario needs to start signed in (`saveSession`).
 */
const signIn = async (page: Page, account: Account) => {
    await page.goto('/auth/debug');
    await page.getByLabel('Email').fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    // The first-run tour shows once per device and, being modal, hides the shell from the
    // accessibility tree until it is closed. This device has seen it from now on.
    const shell = page.getByRole('navigation', { name: 'Navigation' });
    const tour = page.getByRole('dialog').filter({ hasText: 'Welcome to DoU' });
    await expect(shell.or(tour)).toBeVisible({ timeout: 30_000 });
    if (await tour.isVisible()) await tour.getByRole('button', { name: 'Close' }).click();
    await expect(shell).toBeVisible();

    await saveSession(page, account.role);
};

setup('sign in the main account', async ({ page }) => {
    if (!MAIN_ACCOUNT) {
        return setup.skip(true, 'DESKTOP_E2E_EMAIL / DESKTOP_E2E_PASSWORD are not set (see .env.example)');
    }
    await signIn(page, MAIN_ACCOUNT);
});
