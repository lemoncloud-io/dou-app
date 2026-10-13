import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook, waitFor } from '@testing-library/react';

// The pool is the place's member list (`place.list-user`). When that fails, it falls back to the
// union of my channels' rosters — and an unfiltered user-cache read would also return chat authors
// and profile lookups, so that union is assembled per channel id.
let rostersByChannel: Record<string, Array<Record<string, unknown>>> = {};
let channels: Array<{ id: string; name: string; memberIds?: string[]; stereo?: string }> = [];
let isVerified = true;
let refreshRejects: string[] = [];
let switching = 0;
let selectedCloudId: string | null = 'cloud-a';

const refreshList = vi.fn((query: { channelId: string }) =>
    refreshRejects.includes(query.channelId) ? Promise.reject(new Error('denied')) : Promise.resolve()
);

type Member = { id: string; cid?: string; name?: string; thumbnail?: string; isOwner?: boolean };
// Rejects unless a test says otherwise: a cloud whose server has not shipped the action, which is
// exactly the case the roster fallback exists for.
const listPlaceMembers = vi.fn(
    (_query: {
        placeId: string;
        sessionPlaceId: string | null;
    }): Promise<{
        members: Member[];
        context: { cid: string; sid: string };
        profiles: string;
    }> => Promise.reject(new Error('403 FORBIDDEN - not a member of site[site-1]'))
);
const placeList = (members: Member[], context = { cid: 'cloud-a', sid: 'site-1' }) =>
    listPlaceMembers.mockResolvedValue({ members, context, profiles: 'loaded' });

// The runtime returns a singleton repository bundle, so the mock must be identity-stable too —
// a fresh object per render re-runs the load effect on every state change.
const repositories = {
    user: {
        refreshList,
        listPlaceMembers,
        cacheReadList: ({ channelId }: { channelId: string }) =>
            Promise.resolve({ list: rostersByChannel[channelId] ?? [] }),
    },
};

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => repositories,
        },
        connection: {
            useRuntimeSocketState: () => ({ isVerified }),
        },
        session: {
            useSessionIdentity: () => ({ userId: 'me' }),
            useSessionSelection: () => ({ selectedCloudId, selectedSiteId: 'site-1' }),
            // My id in this cloud differs from the session's, as it can for a cloud account.
            useUidInCloud: () => 'me-in-cloud',
            SWITCH_SITE_MUTATION_KEY: ['switch-site'],
            SWITCH_CLOUD_MUTATION_KEY: ['switch-cloud'],
        },
    },
}));
vi.mock('@tanstack/react-query', () => ({
    useIsMutating: ({ mutationKey }: { mutationKey: string[] }) => (mutationKey[0] === 'switch-site' ? switching : 0),
}));
vi.mock('../../../shared', async () => ({
    ...(await vi.importActual<object>('../../../shared/utils/dmDisplay')),
    useChannels: () => ({ channels, isLoading: false }),
    useCurrentPlace: () => ({ place: undefined, placeName: '', placeId: 'site-1' }),
}));

import { useInviteCandidates } from './useInviteCandidates';

describe('useInviteCandidates', () => {
    beforeEach(() => {
        refreshList.mockClear();
        listPlaceMembers.mockClear();
        listPlaceMembers.mockImplementation(() => Promise.reject(new Error('403 FORBIDDEN')));
        rostersByChannel = {};
        channels = [];
        refreshRejects = [];
        isVerified = true;
        switching = 0;
        selectedCloudId = 'cloud-a';
    });

    describe('from the place member list', () => {
        it('offers a member with no channel and one who shares none with me', async () => {
            channels = [
                { id: 'ch-target', name: 'lemoncloud', memberIds: ['me-in-cloud', 'u-in'] },
                { id: 'ch-other', name: 'design' },
            ];
            rostersByChannel = { 'ch-other': [{ id: 'u-co', name: 'Coworker' }] };
            placeList([
                { id: 'owner', name: 'Olivia', isOwner: true },
                { id: 'u-in', name: 'Already in' },
                { id: 'u-co', name: 'Coworker' },
                // Invited into the place only — no channel anywhere, possibly not accepted yet.
                { id: 'u-nochannel', name: 'Placeonly' },
                // In channels of this place, none of them mine.
                { id: 'u-stranger', name: 'Elsewhere' },
            ]);

            const { result } = renderHook(() => useInviteCandidates('ch-target'));

            await waitFor(() => expect(result.current.isLoading).toBe(false));
            expect(result.current.candidates.map(c => c.id)).toEqual(['owner', 'u-co', 'u-nochannel', 'u-stranger']);
            const via = new Map(result.current.candidates.map(c => [c.id, c.viaChannels]));
            expect(via.get('u-co')).toEqual(['design']);
            expect(via.get('u-nochannel')).toEqual([]);
            expect(via.get('u-stranger')).toEqual([]);
            // The roster union is the fallback only — it is not fetched alongside a list that worked.
            expect(refreshList.mock.calls.map(([query]) => query.channelId)).toEqual(['ch-target']);
        });

        it("leaves out the target's members from both the record and its roster, and me under either id", async () => {
            channels = [{ id: 'ch-target', name: 'lemoncloud', memberIds: ['u-record'] }];
            rostersByChannel = { 'ch-target': [{ id: 'u-roster' }] };
            placeList([
                { id: 'me' },
                { id: 'me-in-cloud' },
                { id: 'u-record' },
                { id: 'u-roster' },
                { id: 'u-free', name: 'Free' },
            ]);

            const { result } = renderHook(() => useInviteCandidates('ch-target'));

            await waitFor(() => expect(result.current.isLoading).toBe(false));
            expect(result.current.candidates.map(c => c.id)).toEqual(['u-free']);
        });

        it('offers the whole place minus me when there is no target channel', async () => {
            placeList([{ id: 'me-in-cloud' }, { id: 'u-1', name: 'Aiden' }, { id: 'u-2', name: 'SteveJ' }]);

            const { result } = renderHook(() => useInviteCandidates(null, { enabled: true }));

            await waitFor(() => expect(result.current.isLoading).toBe(false));
            expect(result.current.candidates.map(c => c.id)).toEqual(['u-1', 'u-2']);
            expect(listPlaceMembers).toHaveBeenCalledWith({ placeId: 'site-1', sessionPlaceId: 'site-1' });
            expect(refreshList).not.toHaveBeenCalled();
        });

        it('keeps the picture the list moved to thumbnail, and does not carry isOwner onto the row', async () => {
            placeList([{ id: 'owner', name: 'Olivia', thumbnail: 'data:image/png;base64,AAA', isOwner: true }]);

            const { result } = renderHook(() => useInviteCandidates(null, { enabled: true }));

            await waitFor(() => expect(result.current.candidates).toHaveLength(1));
            expect(result.current.candidates[0]).toMatchObject({ thumbnail: 'data:image/png;base64,AAA' });
            expect(result.current.candidates[0]).not.toHaveProperty('isOwner');
        });

        it('vouches for no place while a switch is in flight, so profiles are not loaded', async () => {
            switching = 1;
            placeList([{ id: 'u-1' }]);

            const { result } = renderHook(() => useInviteCandidates(null, { enabled: true }));

            await waitFor(() => expect(result.current.isLoading).toBe(false));
            expect(listPlaceMembers).toHaveBeenCalledWith({ placeId: 'site-1', sessionPlaceId: null });
        });

        it('falls back to the roster union, unmixed, when the list fails with 403', async () => {
            channels = [
                { id: 'ch-target', name: 'lemoncloud' },
                { id: 'ch-other', name: 'design' },
            ];
            rostersByChannel = { 'ch-target': [{ id: 'me' }], 'ch-other': [{ id: 'u-2', name: 'SteveJ' }] };
            listPlaceMembers.mockRejectedValue(new Error('403 FORBIDDEN - not a member of site[site-1]'));

            const { result } = renderHook(() => useInviteCandidates('ch-target'));

            await waitFor(() => expect(result.current.isLoading).toBe(false));
            expect(result.current.error).toBeNull();
            expect(result.current.candidates.map(c => c.id)).toEqual(['u-2']);
            expect(result.current.candidates[0].viaChannels).toEqual(['design']);
        });

        it('treats an answer asked for in another cloud as no answer and falls back', async () => {
            channels = [{ id: 'ch-a', name: 'design' }];
            rostersByChannel = { 'ch-a': [{ id: 'u-roster', name: 'Roster' }] };
            placeList([{ id: 'u-elsewhere' }], { cid: 'cloud-b', sid: 'site-1' });

            const { result } = renderHook(() => useInviteCandidates(null, { enabled: true }));

            await waitFor(() => expect(result.current.isLoading).toBe(false));
            expect(result.current.candidates.map(c => c.id)).toEqual(['u-roster']);
        });

        it("takes the list on the relay, where no cloud is selected and the repository says 'default'", async () => {
            selectedCloudId = null;
            placeList([{ id: 'u-1' }], { cid: 'default', sid: 'site-1' });

            const { result } = renderHook(() => useInviteCandidates(null, { enabled: true }));

            await waitFor(() => expect(result.current.isLoading).toBe(false));
            expect(result.current.candidates.map(c => c.id)).toEqual(['u-1']);
        });

        it('does not refresh the target roster a second time when the fallback runs', async () => {
            channels = [
                { id: 'ch-target', name: 'lemoncloud' },
                { id: 'ch-other', name: 'design' },
            ];
            listPlaceMembers.mockRejectedValue(new Error('403 FORBIDDEN'));

            const { result } = renderHook(() => useInviteCandidates('ch-target'));

            await waitFor(() => expect(result.current.isLoading).toBe(false));
            expect(refreshList.mock.calls.map(([query]) => query.channelId).sort()).toEqual(['ch-other', 'ch-target']);
        });

        it('serves the cached rosters without asking for the list while the socket is unverified', async () => {
            isVerified = false;
            channels = [{ id: 'ch-a', name: 'design' }];
            rostersByChannel = { 'ch-a': [{ id: 'u-1', name: 'Aiden' }] };
            placeList([{ id: 'u-1' }, { id: 'u-nochannel' }]);

            const { result } = renderHook(() => useInviteCandidates(null, { enabled: true }));

            await waitFor(() => expect(result.current.isLoading).toBe(false));
            expect(listPlaceMembers).not.toHaveBeenCalled();
            expect(result.current.candidates.map(c => c.id)).toEqual(['u-1']);
        });
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

    it('picks up a channel rename that leaves the id set unchanged', async () => {
        channels = [
            { id: 'ch-target', name: 'lemoncloud' },
            { id: 'ch-other', name: 'design' },
        ];
        rostersByChannel = { 'ch-target': [{ id: 'me' }], 'ch-other': [{ id: 'u-2', name: 'SteveJ' }] };

        const { result, rerender } = renderHook(() => useInviteCandidates('ch-target'));
        await waitFor(() => expect(result.current.candidates[0]?.viaChannels).toEqual(['design']));

        channels = [
            { id: 'ch-target', name: 'lemoncloud' },
            { id: 'ch-other', name: 'brand' },
        ];
        rerender();

        await waitFor(() => expect(result.current.candidates[0]?.viaChannels).toEqual(['brand']));
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

    it('offers everyone from my channels, minus me, when there is no target channel', async () => {
        channels = [
            { id: 'ch-a', name: 'design' },
            { id: 'ch-b', name: 'random' },
        ];
        rostersByChannel = {
            'ch-a': [{ id: 'me' }, { id: 'u-1', name: 'Aiden' }],
            'ch-b': [{ id: 'me' }, { id: 'u-2', name: 'SteveJ' }],
        };

        const { result } = renderHook(() => useInviteCandidates(null, { enabled: true }));

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.candidates.map(c => c.id).sort()).toEqual(['u-1', 'u-2']);
    });

    it('loads nothing while disabled, with no target', () => {
        channels = [{ id: 'ch-a', name: 'design' }];

        renderHook(() => useInviteCandidates(null));

        expect(refreshList).not.toHaveBeenCalled();
    });

    it('does not name a 1:1 as the channel a candidate comes from', async () => {
        // A 1:1 usually has no name, so its label would fall back to a raw channel id.
        channels = [
            { id: 'ch-a', name: 'design' },
            { id: 'dm-1', name: '', stereo: 'dm' },
        ];
        rostersByChannel = {
            'ch-a': [{ id: 'u-1', name: 'Aiden' }],
            'dm-1': [{ id: 'me' }, { id: 'u-1', name: 'Aiden' }, { id: 'u-2', name: 'SteveJ' }],
        };

        const { result } = renderHook(() => useInviteCandidates(null, { enabled: true }));

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        const byId = new Map(result.current.candidates.map(c => [c.id, c.viaChannels]));
        expect(byId.get('u-1')).toEqual(['design']);
        expect(byId.get('u-2')).toEqual([]);
    });

    it('reads 1:1 and self rosters from the cache without fetching them', async () => {
        channels = [
            { id: 'ch-a', name: 'design' },
            { id: 'dm-1', name: '', stereo: 'dm' },
            { id: 'self-1', name: '', stereo: 'self' },
        ];
        rostersByChannel = {
            'ch-a': [{ id: 'me' }, { id: 'u-1', name: 'Aiden' }],
            'dm-1': [{ id: 'me' }, { id: 'u-2', name: 'SteveJ' }],
        };

        const { result } = renderHook(() => useInviteCandidates(null, { enabled: true }));

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(refreshList.mock.calls.map(([query]) => query.channelId)).toEqual(['ch-a']);
        expect(result.current.candidates.map(c => c.id).sort()).toEqual(['u-1', 'u-2']);
    });
});
