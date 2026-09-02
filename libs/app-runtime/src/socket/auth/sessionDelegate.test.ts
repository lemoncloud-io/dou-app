import { createSocketSessionDelegate } from './sessionDelegate';
import { logoutCloudSession, logoutRelaySession } from '../../session';

jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../session', () => ({
    getServerAuthRegistration: jest.fn(),
    signServerAuth: jest.fn(),
    commitServerRefreshedToken: jest.fn(),
    logoutCloudSession: jest.fn(),
    logoutRelaySession: jest.fn().mockResolvedValue(undefined),
}));

const mockedLogoutCloud = logoutCloudSession as jest.MockedFunction<typeof logoutCloudSession>;
const mockedLogoutRelay = logoutRelaySession as jest.MockedFunction<typeof logoutRelaySession>;

describe('createSocketSessionDelegate — onAuthExpired', () => {
    beforeEach(() => jest.clearAllMocks());

    it('cloud: tears down only the cloud session, relay untouched', () => {
        const delegate = createSocketSessionDelegate();

        delegate.onAuthExpired?.('cloud');

        expect(mockedLogoutCloud).toHaveBeenCalledTimes(1);
        expect(mockedLogoutRelay).not.toHaveBeenCalled();
    });

    it('relay: auto-logs out after the terminal expired state (maxFailures exhausted)', async () => {
        const delegate = createSocketSessionDelegate();

        await delegate.onAuthExpired?.('relay');

        expect(mockedLogoutRelay).toHaveBeenCalledTimes(1);
        expect(mockedLogoutCloud).not.toHaveBeenCalled();
    });
});
