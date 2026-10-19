import { NO_REPLY } from '../fixtures/backend';
import { pendingRelayInvite, relayInvitePath } from '../fixtures/invites';
import { bringToForeground, currentPath, home, sendToBackground } from '../support/app';
import { expect, test } from '../support/test';

/**
 * Opening a relay 1:1 invite link (apps/web/docs/feature/invite/relay-invite-accept.md § A socket that
 * closes under the request is retried once).
 *
 * In production the link usually arrives as an SMS tap that brings the app back from the background.
 * iOS dropped the sockets while the app was suspended, and the close only reaches the page after the
 * resume, so the invite read goes out on a socket that is about to close and fails with `499`. The
 * relay is back about a second later. The page has to read the invite again over the new socket
 * rather than tell the reader the invite failed.
 *
 * The relay here closes a live socket once the read arrives. That pins the retry, not the moment
 * before it: a socket that is already dead while the slot still reads verified is not imitated.
 */

test('an invite read lost to a socket closing on resume is read again, and the invite shows', async ({
    page,
    shell,
    backend,
}) => {
    // Every read on the first socket is in flight when that socket closes, so none is answered. Keyed
    // on the connection rather than a count: the dev server mounts the page twice (React StrictMode),
    // so the entry read goes out twice on it.
    backend.useSocket({
        'invite.get': () => {
            if (backend.connections > 1) return pendingRelayInvite();
            void backend.dropSockets();
            return NO_REPLY;
        },
    });
    await page.goto('/');
    await expect(home(page)).toBeVisible();

    sendToBackground(shell);
    shell.push('OnNavigate', { path: relayInvitePath(), replace: false });
    bringToForeground(shell);

    await expect(page.getByRole('heading', { name: 'Mina invited you to DoU' })).toBeVisible();
    expect(await currentPath(page)).toMatch(/^\/invite\/accept\?/);
    await expect(page.getByText('Failed to accept the invite.')).toHaveCount(0);
    // Lost on the first socket, and read again once the page had signed in on the next.
    const connections = backend.sent('invite.get').map(frame => frame.connection);
    expect(connections[0]).toBe(1);
    expect(connections.at(-1)).toBeGreaterThan(1);
});
