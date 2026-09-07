import { createSocketSessionDelegate } from './sessionDelegate';
import { cloudSession } from '../../session/auth/cloudSession';
import { relaySession } from '../../session/auth/relaySession';

jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../session', () => ({
    getServerAuthRegistration: jest.fn(),
    signServerAuth: jest.fn(),
    commitServerRefreshedToken: jest.fn(),
}));

// The teardown halves come from the concrete module, not the session barrel: they are deliberately
// off it (ADR-0076 결정 7) so the app cannot reach a socket-silent logout.
jest.mock('../../session/auth/cloudSession', () => ({ cloudSession: { clearStores: jest.fn() } }));
jest.mock('../../session/auth/relaySession', () => ({
    relaySession: { clearAndRedirect: jest.fn().mockResolvedValue(undefined) },
}));

const mockedLogoutCloud = cloudSession.clearStores as jest.Mock;
const mockedLogoutRelay = relaySession.clearAndRedirect as jest.Mock;

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
