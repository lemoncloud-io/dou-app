import { writeFile } from 'node:fs/promises';

import { test as base, expect, type TestInfo } from '@playwright/test';

import { FakeBackend } from '../fixtures/backend';
import { FakeShell, type ShellPlatform } from './fake-shell/fakeShell';

interface Fixtures {
    /** The native shell the page runs inside. Installed before the page loads anything. */
    shell: FakeShell;
    /** The relay, answered from fixtures. */
    backend: FakeBackend;
}

export interface E2EOptions {
    /** Set per browser project in `playwright.config.ts`: WebKit stands in for iOS, Chromium for Android. */
    shellPlatform: ShellPlatform;
}

/**
 * `test` with a fake shell and a fake relay already in place. A scenario opens the app with
 * `page.goto('/')` and finds it inside the app, signed in as a fresh guest, with nothing real behind
 * either side.
 */
export const test = base.extend<Fixtures & E2EOptions>({
    shellPlatform: ['ios', { option: true }],
    // Automatic, so a scenario that never names the relay still cannot reach a real one.
    backend: [
        async ({ page }, use, testInfo) => {
            const backend = await FakeBackend.install(page);
            await use(backend);
            await attachList(testInfo, 'backend-unanswered', backend.unexpected);
        },
        { auto: true },
    ],
    // Automatic too: a scenario that never names the shell still runs inside one, as the app would.
    shell: [
        async ({ page, shellPlatform }, use, testInfo) => {
            const shell = await FakeShell.install(page, { platform: shellPlatform });
            await use(shell);
            await attachList(testInfo, 'shell-not-found', [...new Set(shell.unhandled)]);
            expect(shell.injectionErrors, "the app's injection script failed inside the fake shell").toEqual([]);
            expect(shell.deliveryErrors, 'the fake shell could not deliver a reply').toEqual([]);
        },
        { auto: true },
    ],
});

/**
 * What the fakes were asked and had no answer for, written beside the test's trace and attached to its
 * report. Not a failure: see `FakeBackend` for why. Next to the trace, a failing scenario shows it
 * beside the cause.
 */
const attachList = async (testInfo: TestInfo, name: string, entries: string[]): Promise<void> => {
    if (entries.length === 0) return;
    const path = testInfo.outputPath(`${name}.txt`);
    await writeFile(path, `${entries.join('\n')}\n`);
    await testInfo.attach(name, { path, contentType: 'text/plain' });
};

export { expect };
