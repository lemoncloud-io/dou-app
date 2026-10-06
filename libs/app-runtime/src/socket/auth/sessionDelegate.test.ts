import { createSocketSessionDelegate } from './sessionDelegate';
import { credentialRenewers } from './renewers';
import { RELAY_SLOT, slotKeyOf } from '../utils/slotKey';
import { sessionAuthAdapter } from '../../session/auth/sessionAuthAdapter';
import { alignSessionSite, alignStoredSessionSite } from './alignSessionSite';

jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../session', () => ({
    getServerAuthRegistration: jest.fn(),
    signServerAuth: jest.fn(),
    commitServerRefreshedToken: jest.fn(),
}));

// The delegate's job here is ROUTING, so the renewers are stubbed: what each server does about a
// terminal expiry (relay's confirmation window, a cloud's store-or-cache teardown) is the renewers'
// own contract and is locked in `renewers.test.ts`.
const mockRelayExpiry = jest.fn().mockResolvedValue(undefined);
const mockCloudExpiry = jest.fn();
jest.mock('./renewers', () => {
    const { RELAY_SLOT: relaySlot } = jest.requireActual<{ RELAY_SLOT: string }>('../utils/slotKey');
    return {
        credentialRenewers: {
            relay: { onTerminalExpiry: (...args: unknown[]) => mockRelayExpiry(...args) },
            forSlot: jest.fn((key: string) =>
                key === relaySlot
                    ? { onTerminalExpiry: (...args: unknown[]) => mockRelayExpiry(...args) }
                    : { cid: key, onTerminalExpiry: (...args: unknown[]) => mockCloudExpiry(key, ...args) }
            ),
        },
    };
});

jest.mock('../../session/auth/sessionAuthAdapter', () => ({
    sessionAuthAdapter: { commitRefreshedToken: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('./alignSessionSite', () => ({
    alignSessionSite: jest.fn().mockResolvedValue(undefined),
    alignStoredSessionSite: jest.fn().mockResolvedValue(undefined),
}));

const forSlot = credentialRenewers.forSlot as jest.Mock;

describe('createSocketSessionDelegate — onAuthExpired', () => {
    beforeEach(() => jest.clearAllMocks());

    it('routes a terminal expiry to that slot’s renewer — a cloud', () => {
        const delegate = createSocketSessionDelegate();

        delegate.onAuthExpired?.(slotKeyOf('cloud-1'));

        expect(forSlot).toHaveBeenCalledWith('cloud-1');
        expect(mockCloudExpiry).toHaveBeenCalledWith('cloud-1');
        expect(mockRelayExpiry).not.toHaveBeenCalled();
    });

    it('routes a terminal expiry to that slot’s renewer — relay', async () => {
        const delegate = createSocketSessionDelegate();

        await delegate.onAuthExpired?.(RELAY_SLOT);

        expect(forSlot).toHaveBeenCalledWith(RELAY_SLOT);
        expect(mockRelayExpiry).toHaveBeenCalledTimes(1);
        expect(mockCloudExpiry).not.toHaveBeenCalled();
    });
});

describe('createSocketSessionDelegate — keeping the session on the selected place', () => {
    beforeEach(() => jest.clearAllMocks());

    it('commits a written-back token, then checks the place it names against the selection', async () => {
        const delegate = createSocketSessionDelegate();
        const view = { $site: { id: 'site-default' }, Token: {} };

        await delegate.commitRefreshedToken(slotKeyOf('cloud-1'), view);

        expect(sessionAuthAdapter.commitRefreshedToken).toHaveBeenCalledWith('cloud-1', view);
        expect(alignSessionSite).toHaveBeenCalledWith('cloud-1', 'site-default');
        expect((sessionAuthAdapter.commitRefreshedToken as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
            (alignSessionSite as jest.Mock).mock.invocationCallOrder[0]
        );
    });

    it('checks the stored token each time a slot authenticates — a connect writes nothing back', async () => {
        const delegate = createSocketSessionDelegate();

        await delegate.onAuthenticated?.(slotKeyOf('cloud-1'));

        expect(alignStoredSessionSite).toHaveBeenCalledWith('cloud-1');
    });
});
