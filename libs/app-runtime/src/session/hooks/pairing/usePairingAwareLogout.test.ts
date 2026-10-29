import { act, renderHook } from '@testing-library/react';

import { usePairingAwareLogout } from './usePairingAwareLogout';

const listPairings = jest.fn();
const revokePairing = jest.fn();
let mockNative = true;
let mockPaired = false;

jest.mock('@chatic/bridges', () => ({ isNative: () => mockNative }));
jest.mock('../../../data/hooks/useRuntimeRepositories', () => ({
    useRuntimeRepositories: () => ({ pairing: { listPairings, revokePairing } }),
}));
jest.mock('../../pairing/pairedSession', () => ({ isPairedSession: () => mockPaired }));

const row = (pairingId: string, status = 'approved') => ({
    pairingId,
    purpose: 'web',
    client: {},
    target: { type: 'relay' },
    status,
});

beforeEach(() => {
    jest.clearAllMocks();
    mockNative = true;
    mockPaired = false;
    listPairings.mockResolvedValue({ list: [row('a'), row('b'), row('gone', 'revoked')] });
    revokePairing.mockResolvedValue({ status: 'revoked' });
});

const start = async (onLogout: jest.Mock) => {
    const hook = renderHook(() => usePairingAwareLogout(onLogout));
    await act(async () => {
        await hook.result.current.start();
    });
    return hook;
};

describe('usePairingAwareLogout', () => {
    it('asks first when this app approved sign-ins that still stand', async () => {
        const onLogout = jest.fn();
        const { result } = await start(onLogout);

        expect(result.current.pending?.map(item => item.pairingId)).toEqual(['a', 'b']);
        expect(onLogout).not.toHaveBeenCalled();
    });

    it('revokes each of them, then logs out — even when a revoke fails', async () => {
        revokePairing.mockRejectedValueOnce(new Error('500'));
        const onLogout = jest.fn();
        const { result } = await start(onLogout);

        await act(async () => {
            await result.current.confirm();
        });

        expect(revokePairing.mock.calls.map(([id]) => id)).toEqual(['a', 'b']);
        expect(onLogout).toHaveBeenCalledTimes(1);
        expect(result.current.pending).toBeNull();
    });

    it('logs out at once when nothing was approved', async () => {
        listPairings.mockResolvedValue({ list: [row('gone', 'revoked')] });
        const onLogout = jest.fn();
        await start(onLogout);

        expect(onLogout).toHaveBeenCalledTimes(1);
    });

    it('logs out at once when the list cannot be read', async () => {
        listPairings.mockRejectedValue(new Error('Network Error'));
        const onLogout = jest.fn();
        await start(onLogout);

        expect(onLogout).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['a browser', () => (mockNative = false)],
        ['a secondary device', () => (mockPaired = true)],
    ])('does not read the list on %s', async (_label, arrange) => {
        arrange();
        const onLogout = jest.fn();
        await start(onLogout);

        expect(listPairings).not.toHaveBeenCalled();
        expect(onLogout).toHaveBeenCalledTimes(1);
    });

    it('cancelling keeps the session', async () => {
        const onLogout = jest.fn();
        const { result } = await start(onLogout);

        act(() => result.current.cancel());

        expect(result.current.pending).toBeNull();
        expect(onLogout).not.toHaveBeenCalled();
        expect(revokePairing).not.toHaveBeenCalled();
    });
});
