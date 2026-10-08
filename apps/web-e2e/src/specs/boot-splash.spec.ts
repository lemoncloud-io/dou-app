import type { FakeShell } from '../support/fake-shell/fakeShell';
import { expect, test } from '../support/test';

/**
 * The launch-splash handoff (apps/web/docs/shell/boot-cover.md, and the shell side in
 * apps/mobile/docs/boot/boot-splash.md). The app holds its splash over the whole boot and lifts it
 * when the web posts `FirstScreenReady`; the web posts it once the first route has painted, and at a
 * 10s cap when nothing ever does. A splash lifted too early shows a blank page, one never lifted
 * shows nothing at all — both only visible with the real boot running against a shell. That the
 * signal is sent at most once is the web's unit tests' (`runtime/bootSplash.test.ts`).
 */

/** The release the web logs through the bridge — the reason it gives is what tells the two paths apart. */
const releaseLog = (shell: FakeShell, options?: { timeout?: number }) =>
    shell.waitFor('SendLog', message => /\[bootSplash\] released:/.test(message.data.message ?? ''), options);

test('the app is told to lift its splash once the first screen has painted', async ({ page, shell }) => {
    // What the user would see as the splash goes, read in the page at the moment the signal is posted —
    // not one bridge round trip later, by which time more of the screen may have rendered.
    await page.addInitScript(() => {
        const native = (window as unknown as { ReactNativeWebView: { postMessage: (raw: string) => void } })
            .ReactNativeWebView;
        const post = native.postMessage;
        native.postMessage = raw => {
            if (String(raw).includes('"type":"FirstScreenReady"')) {
                (window as unknown as Record<string, string>)['__e2eScreenAtFirstScreenReady'] =
                    document.getElementById('root')?.innerText ?? '';
            }
            post(raw);
        };
    });

    await page.goto('/');

    const handshake = await shell.waitFor('WebAppReady');
    // How the shell tells this build from an older one, which never posts the signal and is revealed
    // on the handshake instead.
    expect(handshake.data.holdsBootSplash).toBe(true);

    await shell.waitFor('FirstScreenReady');
    expect((await releaseLog(shell)).data.message).toContain('released: first-screen');
    // The home route's own frame, not a blank provider tree behind a session gate: its tab bar is drawn.
    // Its data may still be loading — a screen showing its own loading state counts as painted
    // (apps/web/docs/shell/boot-cover.md), so nothing about the room list is asserted here.
    const screen = await page.evaluate(
        () => (window as unknown as Record<string, string>)['__e2eScreenAtFirstScreenReady']
    );
    expect(screen).toMatch(/^Chat$/m);
    expect(screen).toMatch(/^MY$/m);
});

test('a boot that cannot sign in keeps the splash up until the cap', async ({ page, shell, backend }) => {
    // The relay refuses the guest login, so the signed-out root renders nothing and holds the cover.
    backend.useHttp({
        'POST /oauth/register-device': () => {
            throw new Error('relay unavailable');
        },
    });
    const opened = Date.now();
    await page.goto('/');

    // The first release wins and gives its reason, so `cap` says the cover was held until then.
    const released = await releaseLog(shell, { timeout: 25_000 });
    expect(released.data.message).toContain('released: cap');
    // The cap is armed in main.tsx at 10s, after the bundle has loaded — so never sooner than that.
    expect(Date.now() - opened).toBeGreaterThanOrEqual(10_000);
    // And the app is still told: a boot that never paints must not leave the launch splash up for good.
    await shell.waitFor('FirstScreenReady');
});
