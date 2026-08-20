import { act, renderHook, waitFor } from '@testing-library/react';

import { useKindVerified } from '@chatic/app-runtime';
import { getRelaySessionUser, patchRelaySessionUser, useGlobalSession } from '@chatic/web-core';

import { getRelayAccountGateway } from '../runtime/relayAccountGateway';
import { useMyUser } from './useMyUser';

jest.mock('@chatic/app-runtime', () => ({ useKindVerified: jest.fn() }));
jest.mock('@chatic/web-core', () => ({
    getRelaySessionUser: jest.fn(),
    patchRelaySessionUser: jest.fn(),
    useGlobalSession: jest.fn(),
}));
jest.mock('../runtime/relayAccountGateway', () => ({ getRelayAccountGateway: jest.fn() }));

const profileMock = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    (useKindVerified as jest.Mock).mockReturnValue(true);
    // The real store hands back a NEW context object per session signal; a stable object here is the
    // "nothing changed" case, which is what makes the re-read memo observable.
    (useGlobalSession as jest.Mock).mockReturnValue({ session: 1 });
    (getRelaySessionUser as jest.Mock).mockReturnValue({ id: 'relay-uid', name: 'Relay Me' });
    profileMock.mockResolvedValue({ $user: { name: 'Server Me' } });
    (getRelayAccountGateway as jest.Mock).mockReturnValue({ profile: profileMock });
});

describe('useMyUser', () => {
    it('returns the RELAY account from the token, with no cache read', () => {
        const { result } = renderHook(() => useMyUser());

        expect(getRelaySessionUser).toHaveBeenCalled();
        expect(result.current).toMatchObject({ id: 'relay-uid', name: 'Relay Me' });
    });

    it('is null when there is no relay session', () => {
        (getRelaySessionUser as jest.Mock).mockReturnValue(null);

        const { result } = renderHook(() => useMyUser());

        expect(result.current).toBeNull();
    });

    // The scoped relay client THROWS when its slot is unbound, and firing before the relay handshake
    // is what produced `503 SOCKET NOT CONNECTED` elsewhere — so the fetch waits, the token does not.
    it('holds the refresh until the RELAY slot is verified, but still renders the token value', () => {
        (useKindVerified as jest.Mock).mockReturnValue(false);

        const { result } = renderHook(() => useMyUser());

        expect(profileMock).not.toHaveBeenCalled();
        expect(result.current).toMatchObject({ name: 'Relay Me' });
    });

    it('gates on the relay slot specifically, not the active one', () => {
        renderHook(() => useMyUser());

        expect(useKindVerified).toHaveBeenCalledWith('relay');
    });

    it('writes the relay profile response back into the token — the token IS the fan-out', async () => {
        renderHook(() => useMyUser());

        await waitFor(() => expect(profileMock).toHaveBeenCalledTimes(1));
        expect(patchRelaySessionUser).toHaveBeenCalledWith({ name: 'Server Me' });
    });

    it('tolerates a flat user view (no $user wrapper)', async () => {
        profileMock.mockResolvedValue({ name: 'Flat Me', photo: 'p.png' });

        renderHook(() => useMyUser());

        await waitFor(() => expect(patchRelaySessionUser).toHaveBeenCalledWith({ name: 'Flat Me', photo: 'p.png' }));
    });

    // A response that simply omits a field must not erase it; only ids/bookkeeping are dropped.
    it('patches only account display fields, and skips the patch when none came back', async () => {
        profileMock.mockResolvedValue({ $user: { id: 'relay-uid', updatedAt: 123 } });

        renderHook(() => useMyUser());

        await waitFor(() => expect(profileMock).toHaveBeenCalled());
        expect(patchRelaySessionUser).not.toHaveBeenCalled();
    });

    // The scoped relay client throws SYNCHRONOUSLY on an unbound slot (no silent fallback), and the
    // slot can go away between render and effect. A sync throw here used to escape the effect.
    it('survives the relay slot vanishing between render and effect', async () => {
        profileMock.mockImplementation(() => {
            throw new Error('[SocketManager] no relay slot bound for request(user.profile)');
        });

        const { result } = renderHook(() => useMyUser());

        await waitFor(() => expect(profileMock).toHaveBeenCalled());
        expect(patchRelaySessionUser).not.toHaveBeenCalled();
        expect(result.current).toMatchObject({ name: 'Relay Me' });
    });

    it('survives the gateway itself being unavailable', async () => {
        (getRelayAccountGateway as jest.Mock).mockImplementation(() => {
            throw new Error('[SocketManager] no relay slot bound');
        });

        const { result } = renderHook(() => useMyUser());

        expect(result.current).toMatchObject({ name: 'Relay Me' });
    });

    it('swallows a failed refresh — the token value still stands', async () => {
        profileMock.mockRejectedValue(new Error('503 SOCKET NOT CONNECTED'));

        const { result } = renderHook(() => useMyUser());

        await waitFor(() => expect(profileMock).toHaveBeenCalled());
        expect(patchRelaySessionUser).not.toHaveBeenCalled();
        expect(result.current).toMatchObject({ name: 'Relay Me' });
    });

    it('re-reads the token when the session signal fires', async () => {
        const { result, rerender } = renderHook(() => useMyUser());
        expect(result.current).toMatchObject({ name: 'Relay Me' });

        // A token refresh (or our own patch) invalidates the session context; the store then returns a
        // fresh object, which is the hook's re-read trigger.
        (getRelaySessionUser as jest.Mock).mockReturnValue({ id: 'relay-uid', name: 'Renamed' });
        (useGlobalSession as jest.Mock).mockReturnValue({ session: 2 });
        await act(async () => {
            rerender();
        });

        expect(result.current).toMatchObject({ name: 'Renamed' });
    });
});
