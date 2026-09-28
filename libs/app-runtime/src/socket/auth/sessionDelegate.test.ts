import { createSocketSessionDelegate } from './sessionDelegate';
import { credentialRenewers } from './renewers';
import { RELAY_SLOT, slotKeyOf } from '../utils/slotKey';

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
