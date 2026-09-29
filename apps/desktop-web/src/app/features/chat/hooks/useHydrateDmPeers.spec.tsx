import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook, waitFor } from '@testing-library/react';

const state = vi.hoisted(() => ({ verified: true, cached: {} as Record<string, { id: string; name?: string }> }));
const cacheRead = vi.fn((id: string) => Promise.resolve(state.cached[id] ?? null));
const syncChannelUsers = vi.fn((_query: unknown) => Promise.resolve());
const warn = vi.fn();

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: { useRuntimeRepositories: () => ({ user: { cacheRead, syncChannelUsers } }) },
        connection: { useRuntimeSocketState: () => ({ isVerified: state.verified }) },
    },
}));
vi.mock('@chatic/bridges', () => ({ logger: { warn: (...args: unknown[]) => warn(...args) } }));
vi.mock('../../../shared', async () => await vi.importActual<object>('../../../shared/utils/displayName'));

import { useHydrateDmPeers } from './useHydrateDmPeers';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('useHydrateDmPeers', () => {
    beforeEach(() => {
        state.verified = true;
        state.cached = {};
        cacheRead.mockClear();
        syncChannelUsers.mockReset().mockResolvedValue(undefined);
        warn.mockReset();
    });

    it('loads the members of a 1:1 whose peer has no cached name', async () => {
        renderHook(() => useHydrateDmPeers([{ channelId: 'dm-1', peerId: 'u-1' }]));

        await waitFor(() => expect(syncChannelUsers).toHaveBeenCalledWith({ channelId: 'dm-1', since: 0 }));
    });

    it('skips a peer the cache already names', async () => {
        state.cached = { 'u-1': { id: 'u-1', name: 'Aiden' } };
        renderHook(() => useHydrateDmPeers([{ channelId: 'dm-1', peerId: 'u-1' }]));

        await waitFor(() => expect(cacheRead).toHaveBeenCalledWith('u-1'));
        await flush();
        expect(syncChannelUsers).not.toHaveBeenCalled();
    });

    // A group channel stands for every member of a place who has no 1:1 yet; one named member must
    // not hide another who is not.
    it('loads a shared channel when any of its peers is unnamed, once', async () => {
        state.cached = { 'u-1': { id: 'u-1', name: 'Aiden' } };
        renderHook(() =>
            useHydrateDmPeers([
                { channelId: 'g-1', peerId: 'u-1' },
                { channelId: 'g-1', peerId: 'u-2' },
            ])
        );

        await waitFor(() => expect(syncChannelUsers).toHaveBeenCalledWith({ channelId: 'g-1', since: 0 }));
        await flush();
        expect(syncChannelUsers).toHaveBeenCalledTimes(1);
    });

    // A group room's people change while the list is up; a newcomer still needs a name.
    it('asks a room again for a peer it has not seen, even after an all-named read', async () => {
        state.cached = { 'u-1': { id: 'u-1', name: 'Aiden' } };
        let peers = [{ channelId: 'g-1', peerId: 'u-1' }];
        const { rerender } = renderHook(() => useHydrateDmPeers(peers));
        await waitFor(() => expect(cacheRead).toHaveBeenCalledWith('u-1'));
        await flush();
        expect(syncChannelUsers).not.toHaveBeenCalled();

        peers = [...peers, { channelId: 'g-1', peerId: 'u-2' }];
        rerender();

        await waitFor(() => expect(syncChannelUsers).toHaveBeenCalledWith({ channelId: 'g-1', since: 0 }));
    });

    it('asks each room once across re-renders and a growing list', async () => {
        let peers = [{ channelId: 'dm-1', peerId: 'u-1' }];
        const { rerender } = renderHook(() => useHydrateDmPeers(peers));
        await waitFor(() => expect(syncChannelUsers).toHaveBeenCalledTimes(1));

        peers = [...peers, { channelId: 'dm-2', peerId: 'u-2' }];
        rerender();
        await waitFor(() => expect(syncChannelUsers).toHaveBeenCalledTimes(2));
        rerender();
        await flush();

        expect(syncChannelUsers.mock.calls.map(([query]) => query)).toEqual([
            { channelId: 'dm-1', since: 0 },
            { channelId: 'dm-2', since: 0 },
        ]);
    });

    it('waits for a verified socket', async () => {
        state.verified = false;
        const { rerender } = renderHook(() => useHydrateDmPeers([{ channelId: 'dm-1', peerId: 'u-1' }]));
        await flush();
        expect(syncChannelUsers).not.toHaveBeenCalled();

        state.verified = true;
        rerender();
        await waitFor(() => expect(syncChannelUsers).toHaveBeenCalledTimes(1));
    });

    it('logs a failed load and asks again on the next list change', async () => {
        syncChannelUsers.mockRejectedValueOnce(new Error('offline'));
        let peers = [{ channelId: 'dm-1', peerId: 'u-1' }];
        const { rerender } = renderHook(() => useHydrateDmPeers(peers));
        await waitFor(() => expect(warn).toHaveBeenCalled());

        peers = [...peers, { channelId: 'dm-2', peerId: 'u-2' }];
        rerender();

        await waitFor(() => expect(syncChannelUsers).toHaveBeenCalledTimes(3));
        expect(syncChannelUsers).toHaveBeenCalledWith({ channelId: 'dm-1', since: 0 });
    });
});
