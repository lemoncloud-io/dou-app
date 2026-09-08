import { createSocketSessionDelegate } from './sessionDelegate';
import { credentialRenewers } from './renewers';

jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../session', () => ({
    getServerAuthRegistration: jest.fn(),
    signServerAuth: jest.fn(),
    commitServerRefreshedToken: jest.fn(),
}));

// The delegate's job here is ROUTING, so the renewers are stubbed: what each server does about a
// terminal expiry (relay's confirmation window, cloud's store-only teardown) is the renewers' own
// contract and is locked in `renewers.test.ts`.
jest.mock('./renewers', () => ({
    credentialRenewers: {
        relay: { onTerminalExpiry: jest.fn().mockResolvedValue(undefined) },
        cloud: { onTerminalExpiry: jest.fn() },
    },
}));

const relayExpiry = credentialRenewers.relay.onTerminalExpiry as jest.Mock;
const cloudExpiry = credentialRenewers.cloud.onTerminalExpiry as jest.Mock;

describe('createSocketSessionDelegate — onAuthExpired', () => {
    beforeEach(() => jest.clearAllMocks());

    it('routes a terminal expiry to that kind’s renewer — cloud', () => {
        const delegate = createSocketSessionDelegate();

        delegate.onAuthExpired?.('cloud');

        expect(cloudExpiry).toHaveBeenCalledTimes(1);
        expect(relayExpiry).not.toHaveBeenCalled();
    });

    it('routes a terminal expiry to that kind’s renewer — relay', async () => {
        const delegate = createSocketSessionDelegate();

        await delegate.onAuthExpired?.('relay');

        expect(relayExpiry).toHaveBeenCalledTimes(1);
        expect(cloudExpiry).not.toHaveBeenCalled();
    });
});
