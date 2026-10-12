import { defineConfig, devices } from '@playwright/test';

import { E2E_BASE_URL, E2E_PORT, WEB_SERVER_ENV } from './src/support/env';
import type { E2EOptions } from './src/support/test';

const CI = !!process.env['CI'];

/** The suffix the app's WebView adds to the system user agent (`applicationNameForUserAgent` in `AppWebView`). */
const appUserAgent = (prefix: string, platform: string) => `(${prefix}; DoU E2E/0.28.1; ${platform}; Build:1)`;

/**
 * `apps/web` in its native (WebView) mode, against a fake shell and a fake relay. See README.md for
 * what this can and cannot catch.
 *
 * The server is Vite's dev server: no build step before the first scenario, and the same server a
 * developer already runs. Set `WEB_E2E_PORT` to move it off 5390.
 */
export default defineConfig<E2EOptions>({
    testDir: './src/specs',
    outputDir: '../../dist/.playwright/apps/web-e2e/test-results',
    fullyParallel: true,
    forbidOnly: CI,
    retries: CI ? 1 : 0,
    // Each scenario boots the whole app; more workers than this mostly queue on the dev server.
    workers: CI ? 2 : undefined,
    reporter: CI
        ? [['list'], ['html', { open: 'never', outputFolder: '../../dist/.playwright/apps/web-e2e/report' }]]
        : 'list',
    use: {
        baseURL: E2E_BASE_URL,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        // The two platforms the app ships on. WebKit is not WKWebView and Chromium is not Android
        // System WebView — they are the nearest engines a CI machine can run (README § Limits).
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
        // The first start compiles every dependency Vite pre-bundles.
        timeout: 180_000,
    },
});
