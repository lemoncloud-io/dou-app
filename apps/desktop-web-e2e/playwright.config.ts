import { defineConfig, devices } from '@playwright/test';

import { E2E_BASE_URL, E2E_PORT } from './src/support/env';

/**
 * `apps/desktop-web` in a desktop-sized Chromium window, signed in to real dev accounts against the dev
 * backend. See README.md for what that means for running it.
 *
 * One worker: every scenario shares the same two accounts, and two scenarios moving the same account
 * between clouds at once would read each other's state.
 */
export default defineConfig({
    testDir: './src',
    outputDir: '../../dist/.playwright/apps/desktop-web-e2e/test-results',
    fullyParallel: false,
    workers: 1,
    retries: 0,
    timeout: 90_000,
    expect: { timeout: 15_000 },
    reporter: 'list',
    use: {
        ...devices['Desktop Chrome'],
        baseURL: E2E_BASE_URL,
        // The English bundle: the scenarios name controls by their English labels.
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
        // The developer's own `apps/desktop-web/.env` decides the backend: the dev servers the
        // accounts live on. `/auth/debug` (email sign-in) exists only in a dev server.
        command: `npx vite --port ${E2E_PORT} --strictPort`,
        cwd: '../desktop-web',
        url: E2E_BASE_URL,
        reuseExistingServer: true,
        timeout: 180_000,
    },
});
