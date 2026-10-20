import { existsSync, readFileSync } from 'node:fs';

import { test as base, type Browser, type Page } from '@playwright/test';

import { createChannel, deleteChannel, openPlace, openSelfRoom, switchCloud } from './app';
import { MAIN_ACCOUNT, PEER_ACCOUNT, SANDBOX, sessionFile, storageFile, type Account } from './env';

/** A page signed in as `role`, in a context of its own, with the session the setup project saved. */
export const openAs = async (browser: Browser, role: Account['role']): Promise<Page> => {
    const context = await browser.newContext({ storageState: storageFile(role) });
    // Restored before any app script runs, and only into an empty store: a reload keeps what the
    // app has written since.
    await context.addInitScript(
        saved => {
            try {
                if (sessionStorage.length) return;
                for (const [key, value] of Object.entries(JSON.parse(saved) as Record<string, string>)) {
                    sessionStorage.setItem(key, value);
                }
            } catch {
                // A sandboxed frame (a file preview) has no storage of its own to restore.
            }
        },
        readFileSync(sessionFile(role), 'utf8')
    );
    return context.newPage();
};

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
    /** The peer account, on `/`, with the shell drawn. Skips the scenario when no peer is configured. */
    peer: Page;
}

const ready = async (page: Page) => {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Navigation' }).waitFor({ timeout: 30_000 });
};

export const test = base.extend<Fixtures>({
    app: async ({ browser }, use, testInfo) => {
        testInfo.skip(!MAIN_ACCOUNT || !existsSync(sessionFile('main')), 'the main account is not signed in');
        const page = await openAs(browser, 'main');
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
        await createChannel(app, name);
        await use(name);
        await deleteChannel(app, name);
    },
    peer: async ({ browser }, use, testInfo) => {
        testInfo.skip(!PEER_ACCOUNT || !existsSync(sessionFile('peer')), 'no peer account is configured');
        const page = await openAs(browser, 'peer');
        await ready(page);
        await use(page);
        await page.context().close();
    },
});

export { expect } from '@playwright/test';
