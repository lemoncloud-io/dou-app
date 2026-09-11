import { RelayCredentialRenewer, credentialRenewers } from './renewers';
import { cloudSession } from '../../session/auth/cloudSession';

jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Module-load stubs only: the relay policy under test takes every collaborator it actually consults
// through `RelayExpiryDeps`, so these keep the import graph light without steering a case.
jest.mock('../../session/auth/cloudSession', () => ({ cloudSession: { clearStores: jest.fn() } }));
jest.mock('../../session/auth/relaySession', () => ({
    relaySession: { clearAndRedirect: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../../session/auth/credentialFreshness', () => ({ credentialFreshness: { timeToExpiry: jest.fn() } }));
jest.mock('./authStatus', () => ({ getAuthStatus: jest.fn() }));
jest.mock('./renewCloudSession', () => ({ renewCloudSession: jest.fn() }));
jest.mock('./requestRelaySessionRefresh', () => ({ requestRelaySessionRefresh: jest.fn() }));

/**
 * Terminal relay expiry is the one path that can END a session on its own, and `expired` means two
 * different things (a wedged signature, or three timeouts on a bad link). These cases lock the
 * separation: only a persisting, online expiry costs the user their session.
 */
describe('RelayCredentialRenewer — terminal expiry', () => {
    const build = (
        overrides: Partial<{
            online: boolean[];
            status: 'absent' | 'handshaking' | 'verified' | 'stale' | 'expired';
        }> = {}
    ) => {
        const online = overrides.online ?? [true, true];
        const logout = jest.fn().mockResolvedValue(undefined);
        const wait = jest.fn().mockResolvedValue(undefined);
        const readStatus = jest.fn().mockReturnValue(overrides.status ?? 'expired');
        let call = 0;
        const isOnline = jest.fn(() => online[Math.min(call++, online.length - 1)]);

        return {
            logout,
            wait,
            readStatus,
            isOnline,
            renewer: new RelayCredentialRenewer({ isOnline, wait, readStatus, logout }),
        };
    };

    it('logs out when the expiry is still there after both confirmation windows', async () => {
        const { renewer, logout, wait, readStatus } = build({ status: 'expired' });

        await renewer.onTerminalExpiry();

        expect(wait).toHaveBeenCalledWith(30_000);
        expect(wait).toHaveBeenCalledTimes(2);
        expect(readStatus).toHaveBeenCalledTimes(2);
        expect(logout).toHaveBeenCalledTimes(1);
    });

    it('does not log out while the browser is offline — and does not even wait', async () => {
        const { renewer, logout, wait, readStatus } = build({ online: [false] });

        await renewer.onTerminalExpiry();

        expect(logout).not.toHaveBeenCalled();
        expect(wait).not.toHaveBeenCalled();
        expect(readStatus).not.toHaveBeenCalled();
    });

    it('does not log out when the link drops DURING the confirmation window', async () => {
        const { renewer, logout, readStatus } = build({ online: [true, false] });

        await renewer.onTerminalExpiry();

        expect(logout).not.toHaveBeenCalled();
        // The verdict is abandoned before the status is even consulted — an unattributable expiry.
        expect(readStatus).not.toHaveBeenCalled();
    });

    it.each(['verified', 'stale', 'absent'] as const)(
        'does not log out when the slot POSITIVELY recovered to `%s` inside the window',
        async status => {
            const { renewer, logout, wait } = build({ status });

            await renewer.onTerminalExpiry();

            expect(logout).not.toHaveBeenCalled();
            // A positive heal ends it on the first window — no second wait.
            expect(wait).toHaveBeenCalledTimes(1);
        }
    );

    it('does NOT read `handshaking` as recovery — a re-seed manufactures it', async () => {
        // `register()` resets the SDK failure budget and reports `pending` whenever the controller is
        // inactive, which is exactly what a terminal `expired` leaves behind. Accepting that as
        // recovery let a wedged session re-arm forever (4 more 403s per reconnect, no logout ever).
        const { renewer, logout, wait } = build({ status: 'handshaking' });

        await renewer.onTerminalExpiry();

        expect(wait).toHaveBeenCalledTimes(2);
        expect(logout).toHaveBeenCalledTimes(1);
    });

    it('gives a still-handshaking slot the second window to finish', async () => {
        const { logout, wait, isOnline } = build();
        // Slow but healthy: mid-handshake at 30s, authenticated by 60s.
        const readStatus = jest.fn().mockReturnValueOnce('handshaking').mockReturnValueOnce('verified');
        const renewer = new RelayCredentialRenewer({ isOnline, wait, readStatus, logout });

        await renewer.onTerminalExpiry();

        expect(readStatus).toHaveBeenCalledTimes(2);
        expect(logout).not.toHaveBeenCalled();
    });

    it('logs out when a re-seed only bought the wedged session another burn', async () => {
        const { logout, wait, isOnline } = build();
        // The observed production cycle: re-seeded (handshaking), budget burned again (expired).
        const readStatus = jest.fn().mockReturnValueOnce('handshaking').mockReturnValueOnce('expired');
        const renewer = new RelayCredentialRenewer({ isOnline, wait, readStatus, logout });

        await renewer.onTerminalExpiry();

        expect(logout).toHaveBeenCalledTimes(1);
    });

    it('abandons the verdict when the link drops during the SECOND window', async () => {
        // isOnline is asked at the start and once per window: online, online, then gone.
        const { renewer, logout, readStatus } = build({ status: 'expired', online: [true, true, false] });

        await renewer.onTerminalExpiry();

        expect(readStatus).toHaveBeenCalledTimes(1);
        expect(logout).not.toHaveBeenCalled();
    });

    it('collapses repeated expiry reports onto one pending decision', async () => {
        const { renewer, logout, wait } = build({ status: 'expired' });

        await Promise.all([renewer.onTerminalExpiry(), renewer.onTerminalExpiry(), renewer.onTerminalExpiry()]);

        // One decision, so one pair of windows — not three.
        expect(wait).toHaveBeenCalledTimes(2);
        expect(logout).toHaveBeenCalledTimes(1);
    });

    it('re-evaluates a fresh expiry after the previous decision settled', async () => {
        const { renewer, logout } = build({ status: 'expired' });

        await renewer.onTerminalExpiry();
        await renewer.onTerminalExpiry();

        expect(logout).toHaveBeenCalledTimes(2);
    });
});

describe('CloudCredentialRenewer — terminal expiry', () => {
    it('costs only the cloud: no confirmation window, no relay teardown', () => {
        credentialRenewers.cloud.onTerminalExpiry();

        expect(cloudSession.clearStores).toHaveBeenCalledTimes(1);
    });
});
