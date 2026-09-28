import { logoutCloudSession } from './logoutCloudSession';
import { cloudSession } from '../../session/auth/cloudSession';
import { getCommittedCloudId } from '../../session/store';
import { getSocketManager } from '../runtime';
import { RELAY_SLOT } from '../utils/slotKey';

jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../session/auth/cloudSession', () => ({
    cloudSession: { clearStores: jest.fn() },
}));

jest.mock('../../session/store', () => ({
    getCommittedCloudId: jest.fn(),
}));

jest.mock('../runtime', () => ({
    getSocketManager: jest.fn(),
}));

const mockedLogoutCloud = cloudSession.clearStores as jest.Mock;
const mockedGetManager = getSocketManager as jest.MockedFunction<typeof getSocketManager>;
const mockedGetCommittedCloudId = getCommittedCloudId as jest.MockedFunction<typeof getCommittedCloudId>;

/** Manager whose getClient(slot) resolves a per-slot auth stub (null when that slot is absent). */
const managerWith = (bySlot: { relay?: unknown; cloud?: unknown }) =>
    ({
        getClient: jest.fn((slot: string) => {
            const auth = slot === RELAY_SLOT ? bySlot.relay : bySlot.cloud;
            return auth ? { auth } : null;
        }),
    }) as never;

describe('logoutCloudSession', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedGetCommittedCloudId.mockReturnValue('cloud-1');
    });

    it('notifies ONLY the cloud socket, then clears the cloud store (relay untouched, §8-5)', async () => {
        const cloudLogout = jest.fn().mockResolvedValue(undefined);
        const relayLogout = jest.fn().mockResolvedValue(undefined);
        mockedGetManager.mockReturnValue(
            managerWith({ relay: { logout: relayLogout }, cloud: { logout: cloudLogout } })
        );

        await logoutCloudSession();

        expect(cloudLogout).toHaveBeenCalledTimes(1);
        expect(relayLogout).not.toHaveBeenCalled();
        expect(mockedLogoutCloud).toHaveBeenCalledTimes(1);
    });

    it('clears the cloud store even when the cloud socket is absent', async () => {
        mockedGetManager.mockReturnValue(managerWith({}));

        await expect(logoutCloudSession()).resolves.toBeUndefined();
        expect(mockedLogoutCloud).toHaveBeenCalledTimes(1);
    });

    it('skips the socket notify entirely when no cloud is committed, but still clears the store', async () => {
        mockedGetCommittedCloudId.mockReturnValue(null);
        const cloudLogout = jest.fn().mockResolvedValue(undefined);
        mockedGetManager.mockReturnValue(managerWith({ cloud: { logout: cloudLogout } }));

        await expect(logoutCloudSession()).resolves.toBeUndefined();

        expect(cloudLogout).not.toHaveBeenCalled();
        expect(mockedLogoutCloud).toHaveBeenCalledTimes(1);
    });
});
