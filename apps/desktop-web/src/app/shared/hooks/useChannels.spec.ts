import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook, waitFor } from '@testing-library/react';

type Row = { id: string; name?: string; cid: string; sid: string; stereo?: string; memberIds?: string[] };

let cacheRows: Row[] = [];
let deferEmit = false;
const listeners: Array<(result: { list: Row[] }) => void> = [];
const observeList = vi.fn((_query: { sid: string }, onChange: (result: { list: Row[] }) => void) => {
    listeners.push(onChange);
    if (!deferEmit) onChange({ list: cacheRows });
    return () => undefined;
});

// The runtime hands back one repository bundle for the app's lifetime, so the mock is
// identity-stable too — a fresh object per render would resubscribe on every state change.
const repositories = { channel: { observeList } };

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: { useRuntimeRepositories: () => repositories },
        session: { useSessionIdentity: () => ({ userId: 'me' }) },
        connection: { useRuntimeSocketState: () => ({ isVerified: true }) },
    },
}));
vi.mock('./useChannelReadCursors', () => ({ useChannelReadCursors: () => ({}) }));

let placesState = { places: [{ id: 'place-a' }, { id: 'place-b' }], isLoading: false };
vi.mock('./usePlaces', () => ({ usePlaces: () => placesState }));

import { useChannels } from './useChannels';

const ids = (list: Array<{ id?: string }>) => list.map(c => c.id).sort();

describe('useChannels', () => {
    beforeEach(() => {
        observeList.mockClear();
        cacheRows = [];
        deferEmit = false;
        listeners.length = 0;
        placesState = { places: [{ id: 'place-a' }, { id: 'place-b' }], isLoading: false };
    });

    it('lists a cloud 1:1 in a place where its peer shares a group channel, whichever place its creator stood in', async () => {
        cacheRows = [
            { id: 'group-a', name: 'general', cid: 'cloud-1', sid: 'place-a', memberIds: ['me', 'someone'] },
            { id: 'group-b', name: 'design', cid: 'cloud-1', sid: 'place-b', memberIds: ['me', 'peer'] },
            { id: 'dm-1', cid: 'cloud-1', sid: 'place-a', stereo: 'dm', memberIds: ['me', 'peer'] },
        ];

        const { result } = renderHook(() => useChannels('place-b'));

        await waitFor(() => expect(ids(result.current.channels)).toEqual(['dm-1', 'group-b']));
        // The whole cloud's placement, not only this place's, for callers that route to another place.
        expect(result.current.dmPlaces.get('dm-1')).toEqual(['place-b']);
    });

    it('leaves a cloud 1:1 out of a place its peer is not in', async () => {
        cacheRows = [
            { id: 'group-a', name: 'general', cid: 'cloud-1', sid: 'place-a', memberIds: ['me', 'peer'] },
            { id: 'group-b', name: 'design', cid: 'cloud-1', sid: 'place-b', memberIds: ['me', 'someone'] },
            { id: 'dm-1', cid: 'cloud-1', sid: 'place-a', stereo: 'dm', memberIds: ['me', 'peer'] },
        ];

        const { result } = renderHook(() => useChannels('place-b'));

        await waitFor(() => expect(ids(result.current.channels)).toEqual(['group-b']));
    });

    // Until my places load, no 1:1 can be placed, so the list must not read as final yet.
    it('stays loading until my places have loaded', async () => {
        placesState = { places: [], isLoading: true };
        cacheRows = [
            { id: 'group-b', name: 'design', cid: 'cloud-1', sid: 'place-b', memberIds: ['me', 'peer'] },
            { id: 'dm-1', cid: 'cloud-1', sid: 'place-a', stereo: 'dm', memberIds: ['me', 'peer'] },
        ];

        const { result } = renderHook(() => useChannels('place-b'));

        await waitFor(() => expect(observeList).toHaveBeenCalled());
        expect(result.current.isLoading).toBe(true);
    });

    it('lists a cloud 1:1 exactly once in the place its sid names', async () => {
        cacheRows = [
            { id: 'group-a', name: 'general', cid: 'cloud-1', sid: 'place-a' },
            { id: 'dm-1', cid: 'cloud-1', sid: 'place-a', stereo: 'dm' },
        ];

        const { result } = renderHook(() => useChannels('place-a'));

        await waitFor(() => expect(ids(result.current.channels)).toEqual(['dm-1', 'group-a']));
    });

    it('keeps a relay 1:1 scoped to its own place', async () => {
        cacheRows = [
            { id: 'relay-dm', cid: 'default', sid: 'relay-place', stereo: 'dm' },
            { id: 'relay-other', cid: 'default', sid: 'other-place', stereo: 'dm' },
        ];

        const { result } = renderHook(() => useChannels('relay-place'));

        await waitFor(() => expect(ids(result.current.channels)).toEqual(['relay-dm']));
    });

    it('reads the cloud-wide partition once rather than one partition per place', async () => {
        renderHook(() => useChannels('place-a'));

        await waitFor(() => expect(observeList).toHaveBeenCalledTimes(1));
        expect(observeList.mock.calls[0][0]).toEqual({ sid: '' });
    });

    it('ignores a late emit from the previous scope after a switch, cloud 1:1s included', async () => {
        deferEmit = true;
        const { result, rerender } = renderHook(({ placeId }) => useChannels(placeId), {
            initialProps: { placeId: 'place-a' },
        });
        rerender({ placeId: 'place-b' });

        // The first subscription's read resolves only now, carrying the previous scope's rows.
        act(() => listeners[0]({ list: [{ id: 'stale-dm', cid: 'cloud-1', sid: 'place-a', stereo: 'dm' }] }));
        act(() => listeners[1]({ list: [{ id: 'group-b', name: 'design', cid: 'cloud-1', sid: 'place-b' }] }));

        await waitFor(() => expect(ids(result.current.channels)).toEqual(['group-b']));
    });

    // A place not selected yet (loading, or the site cleared mid cloud switch) lists nothing: a 1:1
    // listed in that window would be auto-selected by the home screen before the place lands.
    it('lists nothing and does not subscribe without a place', () => {
        const { result } = renderHook(() => useChannels(undefined));

        expect(result.current.channels).toEqual([]);
        expect(observeList).not.toHaveBeenCalled();
    });

    // A subscription cloud with no place at all still owns its 1:1s.
    it('lists only the cloud 1:1s for a cloud known to have no place', async () => {
        cacheRows = [
            { id: 'group-a', name: 'general', cid: 'cloud-1', sid: 'place-a' },
            { id: 'dm-1', cid: 'cloud-1', sid: 'place-a', stereo: 'dm' },
            { id: 'relay-dm', cid: 'default', sid: 'relay-place', stereo: 'dm' },
        ];

        const { result } = renderHook(() => useChannels(undefined, { cloudWideOnly: true }));

        await waitFor(() => expect(ids(result.current.channels)).toEqual(['dm-1']));
    });
});
