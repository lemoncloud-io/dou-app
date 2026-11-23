import { transportPlatform } from '@chatic/transport/platform';
import { fakeTransportPorts } from '@chatic/transport/testing/platform';
import { RELAY_CLOUD_ID } from '@chatic/data';

import { RelayCredentialRenewer, credentialRenewers } from './renewers';
import { cloudSession } from '../session/cloudSession';
import { cloudStore } from '@chatic/session/store/stores';
import { getCommittedCloudId } from '@chatic/session/store';
import { backgroundClouds } from '@chatic/transport/socket/backgroundClouds';
import { RELAY_SLOT, slotKeyOf } from '@chatic/transport/socket/utils/slotKey';

jest.mock('@chatic/logger', () => ({
    ...jest.requireActual('@chatic/logger'),
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../session/cloudSession', () => ({ cloudSession: { clearStores: jest.fn() } }));
jest.mock('@chatic/session/store/stores', () => ({ cloudStore: { dropCachedCloudTokens: jest.fn() } }));
jest.mock('@chatic/session/store', () => ({ getCommittedCloudId: jest.fn() }));
jest.mock('../session/relaySession', () => ({
    relaySession: { clearAndRedirect: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('@chatic/session/store/credentialFreshness', () => ({ credentialFreshness: { timeToExpiry: jest.fn() } }));
jest.mock('@chatic/transport/socket/backgroundClouds', () => ({ backgroundClouds: { noteExpired: jest.fn() } }));
jest.mock('./authStatus', () => ({ getAuthStatus: jest.fn() }));
jest.mock('./renewCloudSession', () => ({ renewCloudSession: jest.fn() }));
jest.mock('./requestRelaySessionRefresh', () => ({ requestRelaySessionRefresh: jest.fn() }));
jest.mock('@chatic/transport/socket/runtime', () => ({
    getSocketManager: () => ({ getSlotKeys: () => ['relay', 'cloud-1'], isSlotVerified: () => true }),
}));

beforeEach(() => transportPlatform.configure(fakeTransportPorts()));

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

    it('holds off on the browser flag alone, even while another socket slot still reads verified', async () => {
        Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
        const logout = jest.fn().mockResolvedValue(undefined);
        const wait = jest.fn().mockResolvedValue(undefined);
        const renewer = new RelayCredentialRenewer({ wait, readStatus: () => 'expired', logout });

        try {
            await renewer.onTerminalExpiry();
        } finally {
            Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
        }

        expect(wait).not.toHaveBeenCalled();
        expect(logout).not.toHaveBeenCalled();
    });

    it('does not log out when the link drops DURING the confirmation window', async () => {
        const { renewer, logout, readStatus } = build({ online: [true, false] });

        await renewer.onTerminalExpiry();

        expect(logout).not.toHaveBeenCalled();
        expect(readStatus).not.toHaveBeenCalled();
    });

    it.each(['verified', 'stale', 'absent'] as const)(
        'does not log out when the slot POSITIVELY recovered to `%s` inside the window',
        async status => {
            const { renewer, logout, wait } = build({ status });

            await renewer.onTerminalExpiry();

            expect(logout).not.toHaveBeenCalled();
            expect(wait).toHaveBeenCalledTimes(1);
        }
    );

    it('does NOT read `handshaking` as recovery — a re-seed manufactures it', async () => {
        const { renewer, logout, wait } = build({ status: 'handshaking' });

        await renewer.onTerminalExpiry();

        expect(wait).toHaveBeenCalledTimes(2);
        expect(logout).toHaveBeenCalledTimes(1);
    });

    it('gives a still-handshaking slot the second window to finish', async () => {
        const { logout, wait, isOnline } = build();
        const readStatus = jest.fn().mockReturnValueOnce('handshaking').mockReturnValueOnce('verified');
        const renewer = new RelayCredentialRenewer({ isOnline, wait, readStatus, logout });

        await renewer.onTerminalExpiry();

        expect(readStatus).toHaveBeenCalledTimes(2);
        expect(logout).not.toHaveBeenCalled();
    });

    it('logs out when a re-seed only bought the wedged session another burn', async () => {
        const { logout, wait, isOnline } = build();
        const readStatus = jest.fn().mockReturnValueOnce('handshaking').mockReturnValueOnce('expired');
        const renewer = new RelayCredentialRenewer({ isOnline, wait, readStatus, logout });

        await renewer.onTerminalExpiry();

        expect(logout).toHaveBeenCalledTimes(1);
    });

    it('abandons the verdict when the link drops during the SECOND window', async () => {
        const { renewer, logout, readStatus } = build({ status: 'expired', online: [true, true, false] });

        await renewer.onTerminalExpiry();

        expect(readStatus).toHaveBeenCalledTimes(1);
        expect(logout).not.toHaveBeenCalled();
    });

    it('collapses repeated expiry reports onto one pending decision', async () => {
        const { renewer, logout, wait } = build({ status: 'expired' });

        await Promise.all([renewer.onTerminalExpiry(), renewer.onTerminalExpiry(), renewer.onTerminalExpiry()]);

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

describe('credentialRenewers.forSlot', () => {
    it('answers the relay slot with the relay renewer', () => {
        expect(credentialRenewers.forSlot(RELAY_SLOT)).toBe(credentialRenewers.relay);
        expect(credentialRenewers.relay.cid).toBe(RELAY_CLOUD_ID);
    });

    it('answers a cloud slot with that cloud’s own renewer, one per cloud', () => {
        const first = credentialRenewers.forSlot(slotKeyOf('cloud-1'));

        expect(first.cid).toBe('cloud-1');
        expect(credentialRenewers.forSlot(slotKeyOf('cloud-1'))).toBe(first);
        expect(credentialRenewers.forSlot(slotKeyOf('cloud-2'))).not.toBe(first);
        expect(credentialRenewers.forSlot(slotKeyOf('cloud-2')).cid).toBe('cloud-2');
    });
});

describe('CloudCredentialRenewer — terminal expiry', () => {
    beforeEach(() => jest.clearAllMocks());

    it('costs only the cloud when it is the committed one: no confirmation window, no relay teardown', () => {
        (getCommittedCloudId as jest.Mock).mockReturnValue('cloud-1');

        credentialRenewers.forSlot(slotKeyOf('cloud-1')).onTerminalExpiry();

        expect(cloudSession.clearStores).toHaveBeenCalledTimes(1);
        expect(cloudStore.dropCachedCloudTokens).toHaveBeenCalledTimes(1);
        expect(cloudStore.dropCachedCloudTokens).toHaveBeenCalledWith('cloud-1');
    });

    it('drops only its own cached tokens when it is NOT the committed cloud — the store is another cloud’s', () => {
        (getCommittedCloudId as jest.Mock).mockReturnValue('cloud-1');

        credentialRenewers.forSlot(slotKeyOf('cloud-2')).onTerminalExpiry();

        expect(cloudStore.dropCachedCloudTokens).toHaveBeenCalledWith('cloud-2');
        expect(cloudSession.clearStores).not.toHaveBeenCalled();
    });

    it('notes the expiry for the background slots, committed or not — the cache drop announces nothing', () => {
        (getCommittedCloudId as jest.Mock).mockReturnValue('cloud-1');

        credentialRenewers.forSlot(slotKeyOf('cloud-2')).onTerminalExpiry();
        expect(backgroundClouds.noteExpired).toHaveBeenLastCalledWith('cloud-2');

        credentialRenewers.forSlot(slotKeyOf('cloud-1')).onTerminalExpiry();
        expect(backgroundClouds.noteExpired).toHaveBeenLastCalledWith('cloud-1');
    });

    it('asks which cloud is committed at expiry time, not at construction', () => {
        const renewer = credentialRenewers.forSlot(slotKeyOf('cloud-3'));
        (getCommittedCloudId as jest.Mock).mockReturnValue('cloud-3');

        renewer.onTerminalExpiry();

        expect(cloudSession.clearStores).toHaveBeenCalledTimes(1);
    });
});
