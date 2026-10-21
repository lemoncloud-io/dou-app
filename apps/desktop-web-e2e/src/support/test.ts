import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { test as base, type Browser, type Page } from '@playwright/test';

import { createChannel, deleteChannel, openPlace, openSelfRoom, switchCloud } from './app';
import { AUTH_DIR, MAIN_ACCOUNT, SANDBOX, sessionFile, storageFile, type Role } from './env';
import { installShell } from './shell';

/**
 * Keeps what a scenario needs to start signed in as `role`. In a browser the app keeps its session in
 * `sessionStorage`, which Playwright's storage state does not carry, so that is saved beside it and put
 * back by `openAs` before the page loads.
 */
export const saveSession = async (page: Page, role: Role) => {
    mkdirSync(AUTH_DIR, { recursive: true });
    await page.context().storageState({ path: storageFile(role) });
    writeFileSync(sessionFile(role), await page.evaluate(() => JSON.stringify(sessionStorage)));
};

/**
 * A page signed in as `role`, in a context of its own, with the session saved for it. With `shell`
 * the page runs as if inside the desktop shell (see `installShell`).
 */
export const openAs = async (browser: Browser, role: Role, { shell = false } = {}): Promise<Page> => {
    const context = await browser.newContext({ storageState: storageFile(role) });
    const session = readFileSync(sessionFile(role), 'utf8');
    // Restored before any app script runs, and only into an empty store: a reload keeps what the
    // app has written since.
    await context.addInitScript(saved => {
        try {
            if (sessionStorage.length) return;
            for (const [key, value] of Object.entries(JSON.parse(saved) as Record<string, string>)) {
                sessionStorage.setItem(key, value);
            }
        } catch {
            // A sandboxed frame (a file preview) has no storage of its own to restore.
        }
    }, session);
    if (shell) await installShell(context, session);
    return context.newPage();
};

/** On `/`, with the shell drawn. */
export const ready = async (page: Page) => {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Navigation' }).waitFor({ timeout: 30_000 });
};

interface Options {
    /** Run `app` as if inside the desktop shell, so the banners it raises can be read (`banners()`). */
    shell: boolean;
}

interface Fixtures {
    /** The main account, on `/`, with the shell drawn. */
    app: Page;
    /**
     * A room for the main account to write in, opened in `app`: a channel made for this scenario in the
     * sandbox place and deleted after it, messages and all. Without a sandbox it is the notes-to-self
     * room, and the scenario's messages are deleted one by one instead — see README § Limits for what a
     * room of deleted messages does to the feed.
     */
    room: string;
}

export const test = base.extend<Fixtures & Options>({
    shell: [false, { option: true }],
    app: async ({ browser, shell }, use, testInfo) => {
        testInfo.skip(!MAIN_ACCOUNT || !existsSync(sessionFile('main')), 'the main account is not signed in');
        const page = await openAs(browser, 'main', { shell });
        await ready(page);
        await use(page);
        await page.context().close();
    },
    room: async ({ app }, use) => {
        const { cloud, place } = SANDBOX;
        if (!cloud || !place) {
            await openSelfRoom(app);
            await use('You');
            return;
        }
        const name = `e2e-${Date.now().toString(36)}`;
        await switchCloud(app, cloud);
        await openPlace(app, place);
        // Deleted even when the create did not come back as expected, so a failed start leaves no channel.
        try {
            await createChannel(app, name);
            await use(name);
        } finally {
            await deleteChannel(app, name);
        }
    },
});

export { expect } from '@playwright/test';
