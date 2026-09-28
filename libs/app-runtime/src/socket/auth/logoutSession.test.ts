import { logoutSession } from './logoutSession';
import { relaySession } from '../../session/auth/relaySession';
import { getSocketManager } from '../runtime';
import { RELAY_SLOT, slotKeyOf } from '../utils/slotKey';

jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../session/auth/relaySession', () => ({
    relaySession: { clearAndRedirect: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../runtime', () => ({
    getSocketManager: jest.fn(),
}));

const mockedLogoutRelay = relaySession.clearAndRedirect as jest.Mock;
const mockedGetManager = getSocketManager as jest.MockedFunction<typeof getSocketManager>;

const CLOUD = slotKeyOf('cloud-1');

/**
 * Manager whose getClient(slot)/getSlotKeys() resolve from a per-slot auth stub (relay/cloud keys
 * only — no slot bound when the corresponding value is absent).
 */
const managerWith = (bySlot: { relay?: unknown; cloud?: unknown }) =>
    ({
        getClient: jest.fn((slot: string) => {
            const auth = slot === RELAY_SLOT ? bySlot.relay : slot === CLOUD ? bySlot.cloud : undefined;
            return auth ? { auth } : null;
        }),
        getSlotKeys: jest.fn(() => {
            const keys: string[] = [];
            if (bySlot.relay) keys.push(RELAY_SLOT);
            if (bySlot.cloud) keys.push(CLOUD);
            return keys;
        }),
    }) as never;

describe('logoutSession', () => {
    beforeEach(() => jest.clearAllMocks());

    it('sends socket auth.logout BEFORE the local session teardown', async () => {
        const order: string[] = [];
        const authLogout = jest.fn(() => {
            order.push('auth.logout');
            return Promise.resolve();
        });
        mockedLogoutRelay.mockImplementation(() => {
            order.push('local.teardown');
            return Promise.resolve();
        });
        mockedGetManager.mockReturnValue(managerWith({ relay: { logout: authLogout } }));

        await logoutSession();

        expect(order).toEqual(['auth.logout', 'local.teardown']);
    });

    it('notifies every bound slot (a relay logout ends everything, §8-6)', async () => {
        const relayLogout = jest.fn().mockResolvedValue(undefined);
        const cloudLogout = jest.fn().mockResolvedValue(undefined);
        mockedGetManager.mockReturnValue(
            managerWith({ relay: { logout: relayLogout }, cloud: { logout: cloudLogout } })
        );

        await logoutSession();

        expect(relayLogout).toHaveBeenCalledTimes(1);
        expect(cloudLogout).toHaveBeenCalledTimes(1);
        expect(mockedLogoutRelay).toHaveBeenCalledTimes(1);
    });

    it('still runs the local teardown when there is no socket (teardown is unconditional)', async () => {
        mockedGetManager.mockReturnValue(managerWith({}));

        await logoutSession({ preserveUrl: true });

        expect(mockedLogoutRelay).toHaveBeenCalledWith({ preserveUrl: true });
    });

    it('proceeds to the local teardown even when socket auth.logout throws (best-effort)', async () => {
        const authLogout = jest.fn().mockRejectedValue(new Error('socket gone'));
        mockedGetManager.mockReturnValue(managerWith({ relay: { logout: authLogout } }));

        await expect(logoutSession()).resolves.toBeUndefined();
        expect(mockedLogoutRelay).toHaveBeenCalledTimes(1);
    });

    it('does NOT block the local teardown on a hanging auth.logout ack (wedged socket)', async () => {
        // auth.logout never resolves (server wedged / half-open). logoutSession must still complete
        // the local teardown without awaiting the socket ack.
        const authLogout = jest.fn(() => new Promise<void>(() => undefined)); // never settles
        mockedGetManager.mockReturnValue(managerWith({ relay: { logout: authLogout } }));

        await expect(logoutSession()).resolves.toBeUndefined();
        expect(authLogout).toHaveBeenCalledTimes(1); // frame dispatched
        expect(mockedLogoutRelay).toHaveBeenCalledTimes(1); // local teardown still ran
    });
});
