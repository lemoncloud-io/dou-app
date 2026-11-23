import { defineConfig, devices } from '@playwright/test';

import { E2E_BASE_URL, E2E_PORT, WEB_SERVER_ENV } from './src/support/env';
import type { E2EOptions } from './src/support/test';

const CI = !!process.env['CI'];

const BROWSER_SERVER = process.env['WEB_E2E_BROWSER_SERVER'];

const appUserAgent = (prefix: string, platform: string) => `(${prefix}; DoU E2E/0.28.1; ${platform}; Build:1)`;

export default defineConfig<E2EOptions>({
    testDir: './src/specs',
    outputDir: '../../dist/.playwright/apps/web-e2e/test-results',
    snapshotPathTemplate: '{testDir}/{testFileDir}/{testFileName}-snapshots/{arg}-{projectName}{ext}',
    expect: {
        toHaveScreenshot: { animations: 'disabled', caret: 'hide', maxDiffPixels: 50 },
    },
    fullyParallel: true,
    forbidOnly: CI,
    retries: CI ? 1 : 0,
    workers: CI || BROWSER_SERVER ? 2 : undefined,
    reporter: [
        ['list'],
        ['./src/reporter/evidence-reporter.ts'],
        ...(CI
            ? [['html', { open: 'never', outputFolder: '../../dist/.playwright/apps/web-e2e/report' }] as const]
            : []),
    ],
    use: {
        baseURL: E2E_BASE_URL,
        trace: 'retain-on-failure',
        ...(BROWSER_SERVER ? { connectOptions: { wsEndpoint: BROWSER_SERVER, exposeNetwork: '<loopback>' } } : {}),
        screenshot: 'only-on-failure',
    },
    projects: [
        {
            name: 'webkit-ios',
            use: {
                ...devices['iPhone 15'],
                userAgent: `${devices['iPhone 15'].userAgent} ${appUserAgent('DOU_IOS', 'iOS')}`,
                shellPlatform: 'ios',
            },
        },
        {
            name: 'chromium-android',
            use: {
                ...devices['Pixel 7'],
                userAgent: `${devices['Pixel 7'].userAgent} ${appUserAgent('DOU_ANDROID', 'Android')}`,
                shellPlatform: 'android',
            },
        },
    ],
    webServer: {
        command: `npx vite --port ${E2E_PORT} --strictPort`,
        cwd: '../web',
        url: E2E_BASE_URL,
        env: WEB_SERVER_ENV,
        reuseExistingServer: !CI,
        timeout: 180_000,
    },
});
