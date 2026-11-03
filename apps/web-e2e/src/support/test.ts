import { writeFile } from 'node:fs/promises';

import { test as base, expect, type TestInfo } from '@playwright/test';

import { FakeBackend } from '../fixtures/backend';
import { FakeShell, type ShellPlatform } from './fake-shell/fakeShell';

interface Fixtures {
    /**
     * The native shell the page runs inside. Installed before the page loads anything — unless the
     * scenario runs in a plain browser (`inApp: false`), where there is no shell and this is not set.
     */
    shell: FakeShell;
    /** The relay, answered from fixtures. */
    backend: FakeBackend;
}

export interface E2EOptions {
    /** Set per browser project in `playwright.config.ts`: WebKit stands in for iOS, Chromium for Android. */
    shellPlatform: ShellPlatform;
    /**
     * `false` opens the web app as a browser tab rather than inside the app: no shell is installed, so
     * the page finds no bridge and takes its browser paths. Set with `test.use({ inApp: false })`.
     */
    inApp: boolean;
}

/**
 * The browser's start, matching the shell's (`DEFAULT_CONFIG_BAG` in `fakeShell.ts`): onboarding done,
 * and the debug overlay the suite's `LOCAL` stage would turn on kept off.
 */
const BROWSER_CONFIG_BAG: Record<string, string> = {
    'ui.onboardingCompleted': 'true',
    'debug.overlayEnabled': 'false',
};

/**
 * `test` with a fake shell and a fake relay already in place. A scenario opens the app with
 * `page.goto('/')` and finds it inside the app, signed in as a fresh guest, with nothing real behind
 * either side.
 */
export const test = base.extend<Fixtures & E2EOptions>({
    shellPlatform: ['ios', { option: true }],
    inApp: [true, { option: true }],
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
        async ({ page, shellPlatform, inApp }, use, testInfo) => {
            if (!inApp) {
                // A browser tab has no shell to fake. A browser scenario that names `shell` is asking
                // for something its page cannot have, and fails on the first use. What the shell lane
                // would have started the page with goes into the browser's own storage instead, where
                // `@chatic/config` keeps that lane without a shell (`@chatic/config.<key>`, JSON).
                await page.addInitScript((bag: Record<string, string>) => {
                    for (const [key, value] of Object.entries(bag)) {
                        localStorage.setItem(`@chatic/config.${key}`, value);
                    }
                }, BROWSER_CONFIG_BAG);
                await use(undefined as unknown as FakeShell);
                return;
            }
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
