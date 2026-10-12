import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, cleanup, renderHook } from '@testing-library/react';

const sessionSignal = vi.hoisted(() => ({ n: 0 }));
const relayVerified = vi.hoisted(() => ({ value: false }));
const tokenUser = vi.hoisted(() => ({ value: null as { name?: string; photo?: string } | null }));
const patchRelaySessionUser = vi.hoisted(() => vi.fn());
const gatewayProfile = vi.hoisted(() => vi.fn(async () => ({ $user: { name: 'Ada', photo: 'p' } })));
const gatewayUpdate = vi.hoisted(() => vi.fn(async (data: unknown) => data));

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        connection: {
            RELAY_SLOT: 'relay',
            useSlotVerified: () => relayVerified.value,
        },
        session: {
            useGlobalSession: () => sessionSignal.n,
            getRelaySessionUser: () => tokenUser.value,
            patchRelaySessionUser: (...args: unknown[]) => patchRelaySessionUser(...args),
        },
    },
}));

vi.mock('../runtime/relayAccountGateway', () => ({
    getRelayAccountGateway: () => ({ profile: gatewayProfile, update: gatewayUpdate }),
    resetRelayAccountGateway: vi.fn(),
}));

import { useRelayAccount } from './useRelayAccount';

describe('useRelayAccount', () => {
    beforeEach(() => {
        cleanup();
        vi.clearAllMocks();
        sessionSignal.n = 0;
        relayVerified.value = false;
        tokenUser.value = null;
        gatewayProfile.mockResolvedValue({ $user: { name: 'Ada', photo: 'p' } });
    });

    it('reads the token account with no network while the relay slot is unverified', () => {
        tokenUser.value = { name: 'Token Ada' };
        const { result } = renderHook(() => useRelayAccount());

        expect(result.current.account).toEqual({ name: 'Token Ada' });
        expect(gatewayProfile).not.toHaveBeenCalled();
    });

    it('refreshes the token once the relay verifies', async () => {
        tokenUser.value = { name: 'Token Ada' };
        relayVerified.value = true;
        renderHook(() => useRelayAccount());

        await act(async () => {
            await Promise.resolve();
        });
        expect(gatewayProfile).toHaveBeenCalledTimes(1);
        expect(patchRelaySessionUser).toHaveBeenCalledWith({ name: 'Ada', photo: 'p' });
    });

    it('updates through the gateway and patches the echo', async () => {
        relayVerified.value = true;
        gatewayUpdate.mockResolvedValueOnce({ name: 'Ada II', photo: 'p2' });
        const { result } = renderHook(() => useRelayAccount());

        let updated: unknown;
        await act(async () => {
            updated = await result.current.updateAccount({ name: 'Ada II' });
        });

        expect(gatewayUpdate).toHaveBeenCalledWith({ name: 'Ada II' });
        // Photo was not sent, so the echo's photo is not patched in.
        expect(patchRelaySessionUser).toHaveBeenCalledWith({ name: 'Ada II' });
        expect(updated).toEqual({ name: 'Ada II', photo: 'p2' });
        expect(result.current.isMutating).toBe(false);
    });

    it('falls back to the sent values when the echo comes back thin', async () => {
        relayVerified.value = true;
        gatewayUpdate.mockResolvedValueOnce({});
        const { result } = renderHook(() => useRelayAccount());

        await act(async () => {
            await result.current.updateAccount({ name: 'Ada II', photo: 'p9' });
        });

        expect(patchRelaySessionUser).toHaveBeenCalledWith({ name: 'Ada II', photo: 'p9' });
    });
});
