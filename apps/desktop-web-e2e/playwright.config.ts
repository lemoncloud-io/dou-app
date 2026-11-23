import { defineConfig, devices } from '@playwright/test';

import { E2E_BASE_URL, E2E_PORT, sharedServeEnv } from './src/support/env';

export default defineConfig({
    testDir: './src',
    outputDir: '../../dist/.playwright/apps/desktop-web-e2e/test-results',
    fullyParallel: false,
    workers: 1,
    retries: 0,
    timeout: 90_000,
    expect: { timeout: 15_000 },
    reporter: [
        ['list'],
        [
            '../web-e2e/src/reporter/evidence-reporter.ts',
            { outputDir: '../../dist/.playwright/apps/desktop-web-e2e/evidence', featureMap: false },
        ],
    ],
    use: {
        ...devices['Desktop Chrome'],
        baseURL: E2E_BASE_URL,
        locale: 'en-US',
        viewport: { width: 1440, height: 900 },
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        { name: 'sign-in', testMatch: /sign-in\.setup\.ts/ },
        { name: 'desktop', testMatch: /specs\/.*\.spec\.ts/, dependencies: ['sign-in'] },
    ],
    webServer: {
        command: `npx vite --port ${E2E_PORT} --strictPort`,
        cwd: '../desktop-web',
        env: sharedServeEnv(),
        url: E2E_BASE_URL,
        reuseExistingServer: true,
        timeout: 180_000,
    },
});
