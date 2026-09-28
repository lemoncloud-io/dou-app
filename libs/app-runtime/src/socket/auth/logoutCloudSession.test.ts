import { logoutCloudSession } from './logoutCloudSession';
import { cloudSession } from '../../session/auth/cloudSession';
import { getCommittedCloudId } from '../../session/store';
import { backgroundClouds, resetBackgroundClouds } from '../backgroundClouds';
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

const mockRecentClouds = jest.fn((): string[] => []);
/** Every cloud has a complete cached entry unless a case says otherwise. */
const mockPeekCached = jest.fn((_cid: string): unknown => ({
    delegationToken: { wss: 'wss://cloud' },
    cloudToken: { Token: { identityToken: 'token' } },
}));
jest.mock('../../session/store/stores', () => ({
    cloudStore: {
        getRecentClouds: () => mockRecentClouds(),
        peekCachedCloudTokens: (cid: string) => mockPeekCached(cid),
    },
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
        resetBackgroundClouds();
        mockRecentClouds.mockReturnValue([]);
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

    it('does NOT log out of a cloud that stays a background session — leaving is not signing out', async () => {
        backgroundClouds.setJoined(['cloud-1', 'cloud-2']);
        const cloudLogout = jest.fn().mockResolvedValue(undefined);
        mockedGetManager.mockReturnValue(managerWith({ cloud: { logout: cloudLogout } }));

        await logoutCloudSession();

        expect(cloudLogout).not.toHaveBeenCalled();
        expect(mockedLogoutCloud).toHaveBeenCalledTimes(1);
    });

    it('logs out of a kept cloud whose cached entry its slot could not sign from — it will be torn down', async () => {
        backgroundClouds.setJoined(['cloud-1']);
        mockPeekCached.mockReturnValueOnce(null);
        const cloudLogout = jest.fn().mockResolvedValue(undefined);
        mockedGetManager.mockReturnValue(managerWith({ cloud: { logout: cloudLogout } }));

        await logoutCloudSession();

        expect(cloudLogout).toHaveBeenCalledTimes(1);
    });

    it('leaves a joined cloud past the cap to the binder — it signs off every cap-dropped slot', async () => {
        // Six joined clouds, cloud-1 the least recent: it will be torn down, and SocketBinder says
        // auth.logout as it does. Saying it here too would notify the same socket twice.
        backgroundClouds.setJoined(['cloud-1', 'cloud-2', 'cloud-3', 'cloud-4', 'cloud-5', 'cloud-6']);
        mockRecentClouds.mockReturnValue(['cloud-2', 'cloud-3', 'cloud-4', 'cloud-5', 'cloud-6', 'cloud-1']);
        const cloudLogout = jest.fn().mockResolvedValue(undefined);
        mockedGetManager.mockReturnValue(managerWith({ cloud: { logout: cloudLogout } }));

        await logoutCloudSession();

        expect(cloudLogout).not.toHaveBeenCalled();
    });
});
