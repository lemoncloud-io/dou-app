import type { FakeShell } from '../support/fake-shell/fakeShell';
import { expect, test } from '../support/test';

const releaseLog = (shell: FakeShell, options?: { timeout?: number }) =>
    shell.waitFor('SendLog', message => /\[bootSplash\] released:/.test(message.data.message ?? ''), options);

test('the app is told to lift its splash once the first screen has painted', async ({ page, shell }) => {
    await page.addInitScript(() => {
        const native = (window as unknown as { ReactNativeWebView: { postMessage: (raw: string) => void } })
            .ReactNativeWebView;
        const post = native.postMessage;
        native.postMessage = raw => {
            if (String(raw).includes('"type":"FirstScreenReady"')) {
                const root = document.getElementById('root');
                const record = window as unknown as Record<string, unknown>;
                record['__e2eScreenAtFirstScreenReady'] = root?.innerText ?? '';
                record['__e2eTabsAtFirstScreenReady'] = Array.from(root?.querySelectorAll('nav button') ?? []).map(
                    tab => tab.getAttribute('aria-label') ?? ''
                );
            }
            post(raw);
        };
    });

    await page.goto('/');

    const handshake = await shell.waitFor('WebAppReady');
    expect(handshake.data.holdsBootSplash).toBe(true);

    await shell.waitFor('FirstScreenReady');
    expect((await releaseLog(shell)).data.message).toContain('released: first-screen');
    const { screen, tabs } = await page.evaluate(() => {
        const record = window as unknown as Record<string, unknown>;
        return {
            screen: record['__e2eScreenAtFirstScreenReady'] as string,
            tabs: record['__e2eTabsAtFirstScreenReady'] as string[],
        };
    });
    expect(screen).toMatch(/^Chat$/m);
    expect(tabs).toEqual([
        expect.stringMatching(/^Chat\b/),
        expect.stringMatching(/^(Mini apps|미니앱)\b/),
        expect.stringMatching(/^Alerts\b/),
        'MY',
    ]);
});

test('a boot that cannot sign in keeps the splash up until the cap', async ({ page, shell, backend }) => {
    backend.useHttp({
        'POST /oauth/register-device': () => {
            throw new Error('relay unavailable');
        },
    });
    const opened = Date.now();
    await page.goto('/');

    const released = await releaseLog(shell, { timeout: 25_000 });
    expect(released.data.message).toContain('released: cap');
    expect(Date.now() - opened).toBeGreaterThanOrEqual(10_000);
    await shell.waitFor('FirstScreenReady');
});
