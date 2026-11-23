import { writeFile } from 'node:fs/promises';

import { test as base, expect, type TestInfo } from '@playwright/test';

import { FakeBackend } from '../fixtures/backend';
import { Chaos } from './chaos';
import { Evidence } from './evidence';
import { FakeShell, type FakeShellOptions, type ShellPlatform } from './fake-shell/fakeShell';

interface Fixtures {
    shell: FakeShell;
    backend: FakeBackend;
    chaos: Chaos;
    evidence: Evidence;
}

export interface E2EOptions {
    shellPlatform: ShellPlatform;
    inApp: boolean;
    shellAppVersion: string | undefined;
    shellCapabilities: FakeShellOptions['capabilities'];
}

const BROWSER_CONFIG_BAG: Record<string, string> = {
    'ui.onboardingCompleted': 'true',
    'debug.overlayEnabled': 'false',
};

export const test = base.extend<Fixtures & E2EOptions>({
    shellPlatform: ['ios', { option: true }],
    inApp: [true, { option: true }],
    shellAppVersion: [undefined, { option: true }],
    shellCapabilities: [undefined, { option: true }],
    backend: [
        async ({ page }, use, testInfo) => {
            const backend = await FakeBackend.install(page);
            await use(backend);
            await attachList(testInfo, 'backend-unanswered', backend.unexpected);
        },
        { auto: true },
    ],
    chaos: async ({ page, backend }, use, testInfo) => {
        const chaos = new Chaos(page, backend);
        await use(chaos);
        await chaos.attachTo(testInfo);
        if (testInfo.status === testInfo.expectedStatus) {
            expect(chaos.unfired(), 'faults injected that no request ever met').toEqual([]);
        }
    },
    evidence: async ({ page }, use, testInfo) => {
        const evidence = new Evidence(page, testInfo);
        await use(evidence);
        await evidence.attach();
    },
    shell: [
        async ({ page, shellPlatform, inApp, shellAppVersion, shellCapabilities }, use, testInfo) => {
            if (!inApp) {
                await page.addInitScript((bag: Record<string, string>) => {
                    for (const [key, value] of Object.entries(bag)) {
                        localStorage.setItem(`@chatic/config.${key}`, value);
                    }
                }, BROWSER_CONFIG_BAG);
                await use(undefined as unknown as FakeShell);
                return;
            }
            const shell = await FakeShell.install(page, {
                platform: shellPlatform,
                appVersion: shellAppVersion,
                capabilities: shellCapabilities,
            });
            await use(shell);
            await attachList(testInfo, 'shell-not-found', [...new Set(shell.unhandled)]);
            expect(shell.injectionErrors, "the app's injection script failed inside the fake shell").toEqual([]);
            expect(shell.deliveryErrors, 'the fake shell could not deliver a reply').toEqual([]);
        },
        { auto: true },
    ],
});

const attachList = async (testInfo: TestInfo, name: string, entries: string[]): Promise<void> => {
    if (entries.length === 0) return;
    const path = testInfo.outputPath(`${name}.txt`);
    await writeFile(path, `${entries.join('\n')}\n`);
    await testInfo.attach(name, { path, contentType: 'text/plain' });
};

export { expect };
