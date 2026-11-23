import { NO_REPLY } from '../fixtures/backend';
import { pendingRelayInvite, relayInvitePath } from '../fixtures/invites';
import { bringToForeground, currentPath, home, sendToBackground } from '../support/app';
import { expect, test } from '../support/test';

test('an invite read lost to a socket closing on resume is read again, and the invite shows', async ({
    page,
    shell,
    backend,
}) => {
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
    const connections = backend.sent('invite.get').map(frame => frame.connection);
    expect(connections[0]).toBe(1);
    expect(connections.at(-1)).toBeGreaterThan(1);
});
