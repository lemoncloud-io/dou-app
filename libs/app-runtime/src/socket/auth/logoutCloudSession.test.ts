import { logoutCloudSession } from './logoutCloudSession';
import { logoutCloudSession as clearCloudCoreSession } from '@chatic/web-core';
import { getSocketManager } from '../runtime';

jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('@chatic/web-core', () => ({
    logoutCloudSession: jest.fn(),
}));

jest.mock('../runtime', () => ({
    getSocketManager: jest.fn(),
}));

const mockedLogoutCloud = clearCloudCoreSession as jest.MockedFunction<typeof clearCloudCoreSession>;
const mockedGetManager = getSocketManager as jest.MockedFunction<typeof getSocketManager>;

const managerWith = (byKind: { relay?: unknown; cloud?: unknown }) =>
    ({
        getClient: jest.fn((kind: 'relay' | 'cloud') => {
            const auth = byKind[kind];
            return auth ? { auth } : null;
        }),
    }) as never;

describe('logoutCloudSession', () => {
    beforeEach(() => jest.clearAllMocks());

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
});
