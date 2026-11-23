import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { test as base, type Browser, type Page } from '@playwright/test';

import { createChannel, deleteChannel, openPlace, openSelfRoom, switchCloud } from './app';
import { AUTH_DIR, MAIN_ACCOUNT, SANDBOX, sessionFile, storageFile, type Role } from './env';
import { installShell } from './shell';

export const saveSession = async (page: Page, role: Role) => {
    mkdirSync(AUTH_DIR, { recursive: true });
    await page.context().storageState({ path: storageFile(role) });
    writeFileSync(sessionFile(role), await page.evaluate(() => JSON.stringify(sessionStorage)));
};

export const openAs = async (browser: Browser, role: Role, { shell = false } = {}): Promise<Page> => {
    const context = await browser.newContext({ storageState: storageFile(role) });
    const session = readFileSync(sessionFile(role), 'utf8');
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

export const ready = async (page: Page) => {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Navigation' }).waitFor({ timeout: 30_000 });
};

interface Options {
    shell: boolean;
}

interface Fixtures {
    app: Page;
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
        try {
            await createChannel(app, name);
            await use(name);
        } finally {
            await deleteChannel(app, name);
        }
    },
});

export { expect } from '@playwright/test';
