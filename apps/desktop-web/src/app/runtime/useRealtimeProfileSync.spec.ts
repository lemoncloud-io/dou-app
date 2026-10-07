import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook, waitFor } from '@testing-library/react';

/**
 * The pull itself (`profile.syncProfiles`) is the data layer's, and the cursor bookkeeping is shared
 * with the 60s poll. What belongs to this hook — and what a regression here would silently break —
 * is WHICH server frame triggers a re-pull: the server broadcasts a place-profile change as
 * `profile.sync` (the old `channel.sync-site-profile` is a request name only, never pushed), so a
 * subscription to anything else leaves a peer's nick/photo edit waiting for the next poll.
 */
const mockOnType = vi.fn<(type: string, listener: (message: unknown) => void) => () => void>();
const mockSyncProfiles = vi.fn();
const mockGetSyncedAt = vi.fn();
const mockSetSyncedAt = vi.fn();

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({
                profile: { syncProfiles: mockSyncProfiles },
                syncMeta: { getSyncedAt: mockGetSyncedAt, setSyncedAt: mockSetSyncedAt },
            }),
        },
        session: {
            useGlobalSession: () => ({ activeServer: { kind: 'cloud', cloudId: 'cloud-a' } }),
            useSessionSelection: () => ({ selectedSiteId: 'site-1' }),
        },
        connection: {
            getSocketManager: () => ({ onType: mockOnType }),
        },
    },
}));

import { useRealtimeProfileSync } from './useRealtimeProfileSync';

/** The listener the hook registered for `type`, or undefined when it never subscribed to it. */
const listenerFor = (type: string) => mockOnType.mock.calls.find(([t]) => t === type)?.[1];

beforeEach(() => {
    vi.clearAllMocks();
    mockOnType.mockReturnValue(vi.fn());
    mockGetSyncedAt.mockResolvedValue(100);
    mockSyncProfiles.mockResolvedValue({ syncedAt: 200 });
});

describe('useRealtimeProfileSync', () => {
    it('re-pulls the profile delta when the server pushes a profile.sync frame', async () => {
        renderHook(() => useRealtimeProfileSync());

        const listener = listenerFor('profile.sync');
        expect(listener).toBeDefined();

        // The frame the server broadcasts: the changed profile as the payload, which the hook ignores.
        listener?.({ type: 'profile.sync', data: { id: 'site-1@user-2', siteId: 'site-1', nick: 'new nick' } });

        await waitFor(() => expect(mockSyncProfiles).toHaveBeenCalledWith(100, 'site-1'));
        expect(mockSetSyncedAt).toHaveBeenCalledWith('profile-sync:cloud-a:site-1', 200);
    });

    it('does not subscribe to the retired channel.sync-site-profile type', () => {
        renderHook(() => useRealtimeProfileSync());

        expect(listenerFor('channel.sync-site-profile')).toBeUndefined();
    });

    it('re-pulls on window focus', async () => {
        renderHook(() => useRealtimeProfileSync());

        window.dispatchEvent(new Event('focus'));

        await waitFor(() => expect(mockSyncProfiles).toHaveBeenCalledWith(100, 'site-1'));
    });

    it('unsubscribes from the socket and the window on unmount', () => {
        const off = vi.fn();
        mockOnType.mockReturnValue(off);

        const { unmount } = renderHook(() => useRealtimeProfileSync());
        unmount();
        window.dispatchEvent(new Event('focus'));

        expect(off).toHaveBeenCalledTimes(1);
        expect(mockSyncProfiles).not.toHaveBeenCalled();
    });
});
