import { logoutSession } from './logoutSession';
import { logoutRelaySession } from '@chatic/web-core';
import { getSocketManager } from './runtime';

jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('@chatic/web-core', () => ({
    logoutRelaySession: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./runtime', () => ({
    getSocketManager: jest.fn(),
}));

const mockedLogoutRelay = logoutRelaySession as jest.MockedFunction<typeof logoutRelaySession>;
const mockedGetManager = getSocketManager as jest.MockedFunction<typeof getSocketManager>;

const managerWith = (auth: unknown) => ({ getClient: jest.fn(() => (auth ? { auth } : null)) }) as never;

describe('logoutSession', () => {
    beforeEach(() => jest.clearAllMocks());

    it('sends socket auth.logout BEFORE the authoritative HTTP logout', async () => {
        const order: string[] = [];
        const authLogout = jest.fn(() => {
            order.push('auth.logout');
            return Promise.resolve();
        });
        mockedLogoutRelay.mockImplementation(() => {
            order.push('http.logout');
            return Promise.resolve();
        });
        mockedGetManager.mockReturnValue(managerWith({ logout: authLogout }));

        await logoutSession();

        expect(order).toEqual(['auth.logout', 'http.logout']);
    });

    it('still runs the HTTP logout when there is no socket (disconnected → HTTP is the only revoke)', async () => {
        mockedGetManager.mockReturnValue(managerWith(null));

        await logoutSession({ preserveUrl: true });

        expect(mockedLogoutRelay).toHaveBeenCalledWith({ preserveUrl: true });
    });

    it('proceeds to HTTP logout even when socket auth.logout throws (best-effort)', async () => {
        const authLogout = jest.fn().mockRejectedValue(new Error('socket gone'));
        mockedGetManager.mockReturnValue(managerWith({ logout: authLogout }));

        await expect(logoutSession()).resolves.toBeUndefined();
        expect(mockedLogoutRelay).toHaveBeenCalledTimes(1);
    });

    it('does NOT block the HTTP revoke on a hanging auth.logout ack (wedged socket)', async () => {
        // auth.logout never resolves (server wedged / half-open). logoutSession must still complete
        // the authoritative HTTP revoke without awaiting the socket ack.
        const authLogout = jest.fn(() => new Promise<void>(() => undefined)); // never settles
        mockedGetManager.mockReturnValue(managerWith({ logout: authLogout }));

        await expect(logoutSession()).resolves.toBeUndefined();
        expect(authLogout).toHaveBeenCalledTimes(1); // frame dispatched
        expect(mockedLogoutRelay).toHaveBeenCalledTimes(1); // HTTP revoke still ran
    });
});
