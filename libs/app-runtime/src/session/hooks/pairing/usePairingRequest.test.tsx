import { act, render, renderHook } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';

import { usePairingRequest } from './usePairingRequest';

const requestPairing = jest.fn();
const claimPairing = jest.fn();
const switchCloud = jest.fn();
const applySessionToken = jest.fn();

jest.mock('../../../data/hooks/useRuntimeRepositories', () => ({
    useRuntimeRepositories: () => ({ pairing: { requestPairing, claimPairing } }),
}));
jest.mock('../app/useDynamicDeviceId', () => ({ useDynamicDeviceId: () => ({ deviceId: 'dev-1' }) }));
jest.mock('../session/actions/useSwitchCloudSession', () => ({ useSwitchCloudSession: () => ({ switchCloud }) }));
jest.mock('../../../socket/auth/applySessionToken', () => ({
    applySessionToken: (...args: unknown[]) => applySessionToken(...args),
}));
const addPairedCloud = jest.fn();
jest.mock('../../pairing/pairedClouds', () => ({ pairedClouds: { add: (id: string) => addPairedCloud(id) } }));
jest.mock('../../pairing/pairingClient', () => ({
    pairingClientOf: () => ({ name: 'Chrome · macOS', platform: 'web' }),
}));

const CODE = { pairingId: 'p-1', code: '07344168', expiredAt: Date.now() + 180_000, interval: 5 };

beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    requestPairing.mockResolvedValue(CODE);
    claimPairing.mockResolvedValue({ status: 'pending' });
});
afterEach(() => jest.useRealTimers());

const flush = async () => {
    await act(async () => {
        for (let i = 0; i < 10; i++) await Promise.resolve();
    });
};

describe('usePairingRequest', () => {
    it('requests a code for this device as a web pairing', async () => {
        const { result } = renderHook(() => usePairingRequest());
        await flush();

        expect(requestPairing).toHaveBeenCalledWith({
            purpose: 'web',
            deviceId: 'dev-1',
            client: { name: 'Chrome · macOS', platform: 'web' },
        });
        expect(result.current.state).toMatchObject({ phase: 'waiting', code: '07344168' });
    });

    it('sends one request and no overlapping claims under strict mode', async () => {
        const Probe = () => {
            usePairingRequest();
            return null;
        };
        render(<Probe />, { wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode> });
        await flush();
        await act(async () => {
            jest.advanceTimersByTime(5000);
        });
        await flush();

        expect(requestPairing).toHaveBeenCalledTimes(1);
        expect(claimPairing).toHaveBeenCalledTimes(1);
    });

    it('stops polling once the screen unmounts', async () => {
        const { unmount } = renderHook(() => usePairingRequest());
        await flush();
        unmount();
        await act(async () => {
            jest.advanceTimersByTime(60_000);
        });

        expect(claimPairing).not.toHaveBeenCalled();
    });

    it('applies a relay approval through applySessionToken', async () => {
        const session = { $auth: { id: 'a-1' } };
        claimPairing.mockResolvedValueOnce({ status: 'approved', target: { type: 'relay' }, approver: {}, session });
        const { result } = renderHook(() => usePairingRequest());
        await flush();
        await act(async () => {
            jest.advanceTimersByTime(5000);
        });
        await flush();

        expect(applySessionToken).toHaveBeenCalledWith(session);
        expect(result.current.state.phase).toBe('done');
    });

    it('enters a cloud approval and remembers the cloud only after the switch succeeded', async () => {
        claimPairing.mockResolvedValueOnce({
            status: 'approved',
            target: { type: 'cloud', cloudId: '1000002' },
            approver: {},
        });
        switchCloud.mockRejectedValueOnce(new Error('delegate 403'));
        const { result } = renderHook(() => usePairingRequest());
        await flush();
        await act(async () => {
            jest.advanceTimersByTime(5000);
        });
        await flush();

        expect(switchCloud).toHaveBeenCalledWith('1000002');
        expect(addPairedCloud).not.toHaveBeenCalled();
        expect(result.current.state.phase).toBe('lost');
    });

    it('signs in as a guest first when the screen asks for it', async () => {
        const ensureGuestSession = jest.fn().mockResolvedValue(undefined);
        renderHook(() => usePairingRequest({ ensureGuestSession }));
        await flush();

        expect(ensureGuestSession).toHaveBeenCalledTimes(1);
        expect(ensureGuestSession.mock.invocationCallOrder[0]).toBeLessThan(requestPairing.mock.invocationCallOrder[0]);
    });
});
