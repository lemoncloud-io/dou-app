import { mkdirSync, writeFileSync } from 'node:fs';

import { expect, test as setup, type Page } from '@playwright/test';

import { AUTH_DIR, MAIN_ACCOUNT, PEER_ACCOUNT, sessionFile, storageFile, type Account } from './support/env';

/**
 * Signs each account in once and keeps what a scenario needs to start signed in. In a browser the app
 * keeps its session in `sessionStorage`, which Playwright's storage state does not carry, so that is
 * saved beside it and put back by the `test` fixture before the page loads.
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

    mkdirSync(AUTH_DIR, { recursive: true });
    await page.context().storageState({ path: storageFile(account.role) });
    writeFileSync(sessionFile(account.role), await page.evaluate(() => JSON.stringify(sessionStorage)));
};

setup('sign in the main account', async ({ page }) => {
    if (!MAIN_ACCOUNT) {
        return setup.skip(true, 'DESKTOP_E2E_EMAIL / DESKTOP_E2E_PASSWORD are not set (see .env.example)');
    }
    await signIn(page, MAIN_ACCOUNT);
});

setup('sign in the peer account', async ({ page }) => {
    if (!PEER_ACCOUNT) return setup.skip(true, 'DESKTOP_E2E_PEER_EMAIL / DESKTOP_E2E_PEER_PASSWORD are not set');
    await signIn(page, PEER_ACCOUNT);
});
