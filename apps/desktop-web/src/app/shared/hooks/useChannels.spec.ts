import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook, waitFor } from '@testing-library/react';

import { ACCOUNT_CHANNEL_SID } from '@chatic/runtime-react';

type Row = { id: string; name?: string; cid: string; sid: string; stereo?: string; memberIds?: string[] };

let cacheRows: Row[] = [];
let deferEmit = false;
const listeners: Array<(result: { list: Row[] }) => void> = [];
const observeList = vi.fn((_query: { sid: string }, onChange: (result: { list: Row[] }) => void) => {
    listeners.push(onChange);
    if (!deferEmit) onChange({ list: cacheRows });
    return () => undefined;
});

const repositories = { channel: { observeList } };

vi.mock('@chatic/runtime-react', async () =>
    (await import('@chatic/runtime-react/testing')).fakeRuntimeModule({
        data: { useRuntimeRepositories: () => repositories },
        session: { useSessionIdentity: () => ({ userId: 'me' }) },
        connection: { useRuntimeSocketState: () => ({ isVerified: true }) },
    })
);
vi.mock('./useChannelReadCursors', () => ({ useChannelReadCursors: () => ({}) }));

let placesState = { placeIds: ['place-a', 'place-b'], isLoading: false };
vi.mock('./usePlaces', () => ({ usePlaces: () => placesState }));

import { useChannels } from './useChannels';

const ids = (list: Array<{ id?: string }>) => list.map(c => c.id).sort();

describe('useChannels', () => {
    beforeEach(() => {
        observeList.mockClear();
        cacheRows = [];
        deferEmit = false;
        listeners.length = 0;
        placesState = { placeIds: ['place-a', 'place-b'], isLoading: false };
    });

    it('lists a cloud 1:1 in its own place only, wherever its peer is', async () => {
        cacheRows = [
            { id: 'group-a', name: 'general', cid: 'cloud-1', sid: 'place-a', memberIds: ['me', 'someone'] },
            { id: 'group-b', name: 'design', cid: 'cloud-1', sid: 'place-b', memberIds: ['me', 'peer'] },
            { id: 'place-a@me@peer', cid: 'cloud-1', sid: 'place-a', stereo: 'dm', memberIds: ['me', 'peer'] },
        ];

        const inA = renderHook(() => useChannels('place-a'));
        const inB = renderHook(() => useChannels('place-b'));

        await waitFor(() => expect(ids(inA.result.current.channels)).toEqual(['group-a', 'place-a@me@peer']));
        await waitFor(() => expect(ids(inB.result.current.channels)).toEqual(['group-b']));
        expect(inB.result.current.filedPlaces.get('place-a@me@peer')).toEqual(['place-a']);
        expect(inB.result.current.memberPeers).toEqual([{ peerId: 'peer', channelId: 'group-b' }]);
    });

    it('lists the 1:1s with one person in two places each in its own place', async () => {
        cacheRows = [
            { id: 'place-a@me@peer', cid: 'cloud-1', sid: 'place-a', stereo: 'dm', memberIds: ['me', 'peer'] },
            { id: 'place-b@me@peer', cid: 'cloud-1', sid: 'place-b', stereo: 'dm', memberIds: ['me', 'peer'] },
        ];

        const inA = renderHook(() => useChannels('place-a'));
        const inB = renderHook(() => useChannels('place-b'));

        await waitFor(() => expect(ids(inA.result.current.channels)).toEqual(['place-a@me@peer']));
        await waitFor(() => expect(ids(inB.result.current.channels)).toEqual(['place-b@me@peer']));
    });

    it("lists the open place's members who have no 1:1 here yet", async () => {
        cacheRows = [
            { id: 'group-b', name: 'design', cid: 'cloud-1', sid: 'place-b', memberIds: ['me', 'peer', 'new'] },
            { id: 'place-b@me@peer', cid: 'cloud-1', sid: 'place-b', stereo: 'dm', memberIds: ['me', 'peer'] },
        ];

        const { result } = renderHook(() => useChannels('place-b'));

        await waitFor(() => expect(result.current.memberPeers).toEqual([{ peerId: 'new', channelId: 'group-b' }]));
    });

    it('stays loading until my places have loaded', async () => {
        placesState = { placeIds: [], isLoading: true };
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

        act(() => listeners[0]({ list: [{ id: 'stale-dm', cid: 'cloud-1', sid: 'place-a', stereo: 'dm' }] }));
        act(() => listeners[1]({ list: [{ id: 'group-b', name: 'design', cid: 'cloud-1', sid: 'place-b' }] }));

        await waitFor(() => expect(ids(result.current.channels)).toEqual(['group-b']));
    });

    it('lists nothing and does not subscribe without a place', () => {
        const { result } = renderHook(() => useChannels(undefined));

        expect(result.current.channels).toEqual([]);
        expect(observeList).not.toHaveBeenCalled();
    });

    it('lists only the cloud 1:1s for a cloud known to have no place', async () => {
        placesState = { placeIds: [], isLoading: false };
        cacheRows = [
            { id: 'group-a', name: 'general', cid: 'cloud-1', sid: 'place-a' },
            { id: 'dm-1', cid: 'cloud-1', sid: 'place-a', stereo: 'dm' },
            { id: 'me@peer', cid: 'cloud-1', sid: '', stereo: 'dm' },
            { id: 'relay-dm', cid: 'default', sid: 'relay-place', stereo: 'dm' },
        ];

        const { result } = renderHook(() => useChannels(undefined, { whenNoPlace: 'cloudDms' }));

        await waitFor(() => expect(ids(result.current.channels)).toEqual(['dm-1', 'me@peer']));
    });

    it('lists the Self Channel on Home, which has no place', async () => {
        placesState = { placeIds: [], isLoading: false };
        cacheRows = [{ id: 'U:me', cid: 'default', sid: 'relay-place', stereo: 'self', memberIds: ['me'] }];

        const { result } = renderHook(() => useChannels(undefined, { whenNoPlace: 'relay' }));

        await waitFor(() => expect(ids(result.current.channels)).toEqual(['U:me']));
        expect(result.current.isLoading).toBe(false);
    });

    it('lists every relay row on Home, but no row of another cloud', async () => {
        placesState = { placeIds: [], isLoading: false };
        cacheRows = [
            { id: 'U:me', cid: 'default', sid: 'relay-place', stereo: 'self' },
            { id: 'relay-dm', cid: 'default', sid: 'relay-place', stereo: 'dm' },
            { id: 'relay-group', name: 'lobby', cid: 'default', sid: 'relay-place' },
            { id: 'cloud-dm', cid: 'cloud-1', sid: 'place-a', stereo: 'dm' },
            { id: 'cloud-group', name: 'general', cid: 'cloud-1', sid: 'place-a' },
        ];

        const { result } = renderHook(() => useChannels(undefined, { whenNoPlace: 'relay' }));

        await waitFor(() => expect(ids(result.current.channels)).toEqual(['U:me', 'relay-dm', 'relay-group']));
    });

    it('lists the account-scoped Self Channel inside a place too', async () => {
        placesState = { placeIds: ['relay-place'], isLoading: false };
        cacheRows = [
            { id: 'U:me', cid: 'default', sid: ACCOUNT_CHANNEL_SID, stereo: 'self' },
            { id: 'relay-group', name: 'lobby', cid: 'default', sid: 'relay-place' },
            { id: 'other-group', name: 'other', cid: 'default', sid: 'other-place' },
        ];

        const { result } = renderHook(() => useChannels('relay-place', { whenNoPlace: 'relay' }));

        await waitFor(() => expect(ids(result.current.channels)).toEqual(['U:me', 'relay-group']));
    });
});
