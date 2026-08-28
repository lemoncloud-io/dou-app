import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook, waitFor } from '@testing-library/react';

// There is no cloud-wide user directory (`channel.list-user` is per channel), so the candidate
// pool is the union of my other channels' rosters. An unfiltered user-cache read would also
// return chat authors and profile lookups, so the union must be assembled per channel id.
let rostersByChannel: Record<string, Array<Record<string, unknown>>> = {};
let channels: Array<{ id: string; name: string; memberIds?: string[] }> = [];
let isVerified = true;
let refreshRejects: string[] = [];

const refreshList = vi.fn((query: { channelId: string }) =>
    refreshRejects.includes(query.channelId) ? Promise.reject(new Error('denied')) : Promise.resolve()
);

// The runtime returns a singleton repository bundle, so the mock must be identity-stable too —
// a fresh object per render re-runs the load effect on every state change.
const repositories = {
    user: {
        refreshList,
        cacheReadList: ({ channelId }: { channelId: string }) =>
            Promise.resolve({ list: rostersByChannel[channelId] ?? [] }),
    },
};

vi.mock('@chatic/app-runtime', () => ({
    useRuntimeRepositories: () => repositories,
    useSocketState: () => ({ isVerified }),
}));
vi.mock('@chatic/web-core', () => ({
    useSessionIdentity: () => ({ userId: 'me' }),
}));
vi.mock('../../../shared', () => ({
    useChannels: () => ({ channels, isLoading: false }),
    useCurrentPlace: () => ({ place: undefined, placeName: '', placeId: 'site-1' }),
}));

import { useInviteCandidates } from './useInviteCandidates';

describe('useInviteCandidates', () => {
    beforeEach(() => {
        refreshList.mockClear();
        rostersByChannel = {};
        channels = [];
        refreshRejects = [];
        isVerified = true;
    });

    it('offers members of my other channels, minus the target roster and myself', async () => {
        channels = [
            { id: 'ch-target', name: 'lemoncloud' },
            { id: 'ch-other', name: 'design' },
        ];
        rostersByChannel = {
            'ch-target': [{ id: 'me' }, { id: 'u-1', name: 'Aiden' }],
            'ch-other': [{ id: 'me' }, { id: 'u-1', name: 'Aiden' }, { id: 'u-2', name: 'SteveJ' }],
        };

        const { result } = renderHook(() => useInviteCandidates('ch-target'));

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.candidates.map(c => c.id)).toEqual(['u-2']);
        expect(result.current.candidates[0].viaChannels).toEqual(['design']);
    });

    it('lists every channel a candidate comes from, without duplicating the candidate', async () => {
        channels = [
            { id: 'ch-target', name: 'lemoncloud' },
            { id: 'ch-a', name: 'design' },
            { id: 'ch-b', name: 'random' },
        ];
        rostersByChannel = {
            'ch-target': [{ id: 'me' }],
            'ch-a': [{ id: 'u-2', name: 'SteveJ' }],
            'ch-b': [{ id: 'u-2', name: 'SteveJ' }],
        };

        const { result } = renderHook(() => useInviteCandidates('ch-target'));

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.candidates).toHaveLength(1);
        expect(result.current.candidates[0].viaChannels).toEqual(['design', 'random']);
    });

    it('keeps the pool a partial one when a single channel roster fails', async () => {
        channels = [
            { id: 'ch-target', name: 'lemoncloud' },
            { id: 'ch-a', name: 'design' },
            { id: 'ch-b', name: 'random' },
        ];
        refreshRejects = ['ch-a'];
        rostersByChannel = { 'ch-target': [{ id: 'me' }], 'ch-b': [{ id: 'u-3', name: 'Gina' }] };

        const { result } = renderHook(() => useInviteCandidates('ch-target'));

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.error).toBeNull();
        expect(result.current.candidates.map(c => c.id)).toEqual(['u-3']);
    });

    it('reports an error only when every roster fails', async () => {
        channels = [{ id: 'ch-target', name: 'lemoncloud' }];
        refreshRejects = ['ch-target'];

        const { result } = renderHook(() => useInviteCandidates('ch-target'));

        await waitFor(() => expect(result.current.error).not.toBeNull());
        expect(result.current.candidates).toEqual([]);
    });

    it('still loads the target roster when the channel list has not arrived yet', async () => {
        channels = [];
        rostersByChannel = { 'ch-target': [{ id: 'me' }] };

        const { result } = renderHook(() => useInviteCandidates('ch-target'));

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(refreshList).toHaveBeenCalledWith({ channelId: 'ch-target', detail: true });
    });
    it('falls back to the cached rosters when the socket never verifies', async () => {
        // A sleep/wake wedge can leave the socket unverified indefinitely (see useChannels).
        // Gating the whole load on it pinned the picker on its loading state forever.
        isVerified = false;
        channels = [
            { id: 'ch-target', name: 'lemoncloud' },
            { id: 'ch-other', name: 'design' },
        ];
        rostersByChannel = { 'ch-target': [{ id: 'me' }], 'ch-other': [{ id: 'u-2', name: 'SteveJ' }] };

        const { result } = renderHook(() => useInviteCandidates('ch-target'));

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(refreshList).not.toHaveBeenCalled();
        expect(result.current.candidates.map(c => c.id)).toEqual(['u-2']);
    });

    it("excludes the target's members from the channel record when its roster read fails", async () => {
        channels = [
            { id: 'ch-target', name: 'lemoncloud', memberIds: ['me', 'u-1'] },
            { id: 'ch-other', name: 'design' },
        ];
        refreshRejects = ['ch-target'];
        rostersByChannel = {
            'ch-other': [
                { id: 'u-1', name: 'Aiden' },
                { id: 'u-2', name: 'SteveJ' },
            ],
        };

        const { result } = renderHook(() => useInviteCandidates('ch-target'));

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        // u-1 is already in the channel; without the memberIds fallback the empty roster would offer them.
        expect(result.current.candidates.map(c => c.id)).toEqual(['u-2']);
    });
});
