import { act, renderHook, waitFor } from '@testing-library/react';

import { runtime } from '@chatic/runtime-react';

import { useIsAccountGuest, useMyUser } from './useMyUser';

jest.mock('@chatic/runtime-react', () =>
    require('@chatic/runtime-react/testing').fakeRuntimeModule({
        connection: {
            RELAY_SLOT: 'default',
            useSlotVerified: jest.fn(),
        },
        session: {
            useGlobalSession: jest.fn(),
            getRelaySessionUser: jest.fn(),
            patchRelaySessionUser: jest.fn(),
            fetchAccountProfile: (...args: unknown[]) => profileMock(...args),
        },
    })
);

const profileMock = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    (runtime.connection.useSlotVerified as jest.Mock).mockReturnValue(true);
    (runtime.session.useGlobalSession as jest.Mock).mockReturnValue({ session: 1 });
    (runtime.session.getRelaySessionUser as jest.Mock).mockReturnValue({ id: 'relay-uid', name: 'Relay Me' });
    profileMock.mockResolvedValue({ $user: { name: 'Server Me' } });
});

describe('useMyUser', () => {
    it('returns the RELAY account from the token, with no cache read', () => {
        const { result } = renderHook(() => useMyUser());

        expect(runtime.session.getRelaySessionUser).toHaveBeenCalled();
        expect(result.current).toMatchObject({ id: 'relay-uid', name: 'Relay Me' });
    });

    it('is null when there is no relay session', () => {
        (runtime.session.getRelaySessionUser as jest.Mock).mockReturnValue(null);

        const { result } = renderHook(() => useMyUser());

        expect(result.current).toBeNull();
    });

    it('holds the refresh until the RELAY slot is verified, but still renders the token value', () => {
        (runtime.connection.useSlotVerified as jest.Mock).mockReturnValue(false);

        const { result } = renderHook(() => useMyUser());

        expect(profileMock).not.toHaveBeenCalled();
        expect(result.current).toMatchObject({ name: 'Relay Me' });
    });

    it('gates on the relay slot specifically, not the active one', () => {
        renderHook(() => useMyUser());

        expect(runtime.connection.useSlotVerified).toHaveBeenCalledWith('default');
    });

    it('writes the relay profile response back into the token — the token IS the fan-out', async () => {
        renderHook(() => useMyUser());

        await waitFor(() => expect(profileMock).toHaveBeenCalledTimes(1));
        expect(runtime.session.patchRelaySessionUser).toHaveBeenCalledWith({ name: 'Server Me' });
    });

    it('tolerates a flat user view (no $user wrapper)', async () => {
        profileMock.mockResolvedValue({ name: 'Flat Me', photo: 'p.png' });

        renderHook(() => useMyUser());

        await waitFor(() =>
            expect(runtime.session.patchRelaySessionUser).toHaveBeenCalledWith({ name: 'Flat Me', photo: 'p.png' })
        );
    });

    it('patches only account display fields, and skips the patch when none came back', async () => {
        profileMock.mockResolvedValue({ $user: { id: 'relay-uid', updatedAt: 123 } });

        renderHook(() => useMyUser());

        await waitFor(() => expect(profileMock).toHaveBeenCalled());
        expect(runtime.session.patchRelaySessionUser).not.toHaveBeenCalled();
    });

    it('survives the relay slot vanishing between render and effect', async () => {
        profileMock.mockImplementation(() => {
            throw new Error('[SocketManager] no relay slot bound for request(user.profile)');
        });

        const { result } = renderHook(() => useMyUser());

        await waitFor(() => expect(profileMock).toHaveBeenCalled());
        expect(runtime.session.patchRelaySessionUser).not.toHaveBeenCalled();
        expect(result.current).toMatchObject({ name: 'Relay Me' });
    });

    it('swallows a failed refresh — the token value still stands', async () => {
        profileMock.mockRejectedValue(new Error('503 SOCKET NOT CONNECTED'));

        const { result } = renderHook(() => useMyUser());

        await waitFor(() => expect(profileMock).toHaveBeenCalled());
        expect(runtime.session.patchRelaySessionUser).not.toHaveBeenCalled();
        expect(result.current).toMatchObject({ name: 'Relay Me' });
    });

    it('re-reads the token when the session signal fires', async () => {
        const { result, rerender } = renderHook(() => useMyUser());
        expect(result.current).toMatchObject({ name: 'Relay Me' });

        (runtime.session.getRelaySessionUser as jest.Mock).mockReturnValue({ id: 'relay-uid', name: 'Renamed' });
        (runtime.session.useGlobalSession as jest.Mock).mockReturnValue({ session: 2 });
        await act(async () => {
            rerender();
        });

        expect(result.current).toMatchObject({ name: 'Renamed' });
    });
});

describe('useIsAccountGuest', () => {
    it('reads the token without triggering the profile refresh', () => {
        (runtime.session.getRelaySessionUser as jest.Mock).mockReturnValue({ id: 'relay-uid', userRole: 'user' });

        renderHook(() => useIsAccountGuest());

        expect(profileMock).not.toHaveBeenCalled();
    });

    it('reports a guest when the relay account carries the guest role', () => {
        (runtime.session.getRelaySessionUser as jest.Mock).mockReturnValue({ id: 'relay-uid', userRole: 'guest' });

        expect(renderHook(() => useIsAccountGuest()).result.current).toBe(true);
    });

    it('reports a signed-in account when the relay role is anything else', () => {
        (runtime.session.getRelaySessionUser as jest.Mock).mockReturnValue({
            id: 'relay-uid',
            name: 'Me',
            userRole: 'user',
        });

        expect(renderHook(() => useIsAccountGuest()).result.current).toBe(false);
    });

    it('ignores the active session and answers from the relay token', () => {
        (runtime.session.getRelaySessionUser as jest.Mock).mockReturnValue({
            id: 'relay-uid',
            name: 'Me',
            userRole: 'user',
        });

        expect(renderHook(() => useIsAccountGuest()).result.current).toBe(false);
        expect(runtime.session.getRelaySessionUser).toHaveBeenCalled();
    });

    it('treats a missing relay account as a guest', () => {
        (runtime.session.getRelaySessionUser as jest.Mock).mockReturnValue(null);

        expect(renderHook(() => useIsAccountGuest()).result.current).toBe(true);
    });

    it('treats an account with no role yet as a signed-in one, not a guest', () => {
        (runtime.session.getRelaySessionUser as jest.Mock).mockReturnValue({ id: 'relay-uid', name: 'Me' });

        expect(renderHook(() => useIsAccountGuest()).result.current).toBe(false);
    });
});
