import { act, renderHook, waitFor } from '@testing-library/react';

import { runtime } from '@chatic/app-runtime';
import type { DomainUser } from '@chatic/data';

import { usePeerCloudNames, type CloudDmPeerRef } from './usePeerCloudNames';

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: { useRuntimeRepositories: jest.fn() },
        connection: { useCloudVerified: jest.fn() },
        session: { useSessionSelection: jest.fn(), getGlobalSessionContext: jest.fn(), useUidInCloud: jest.fn() },
    },
}));
jest.mock('@chatic/bridges', () => ({ logger: { warn: jest.fn() } }));

const observeItem = jest.fn();
const cacheRead = jest.fn();
const syncChannelUsers = jest.fn();

// The user cache, as observeItem and cacheRead see it. `emit` replays a write to every observer.
let cache: Map<string, Partial<DomainUser>>;
let observers: Map<string, (user: DomainUser | null) => void>;
const emit = (id: string, user: Partial<DomainUser>) => {
    cache.set(id, user);
    act(() => observers.get(id)?.(user as DomainUser));
};

const row = (channelId: string, peerId: string, profileNick?: string, cid = 'cloud-a'): CloudDmPeerRef => ({
    channelId,
    cid,
    peerId,
    profileNick,
});

// The selection as render sees it and as the live session context reports it — one value, as in the app.
const setSelectedCloud = (cid: string) => {
    (runtime.session.useSessionSelection as jest.Mock).mockReturnValue({ selectedCloudId: cid });
    (runtime.session.getGlobalSessionContext as jest.Mock).mockReturnValue({ cloud: { cloudId: cid } });
};

beforeEach(() => {
    jest.clearAllMocks();
    cache = new Map();
    observers = new Map();
    observeItem.mockImplementation((id: string, cb: (user: DomainUser | null) => void) => {
        observers.set(id, cb);
        cb((cache.get(id) as DomainUser) ?? null);
        return () => observers.delete(id);
    });
    cacheRead.mockImplementation(async (id: string) => cache.get(id) ?? null);
    syncChannelUsers.mockResolvedValue(0);
    // ONE repository for every cloud, as the app hands it out: its identity never changes on a switch.
    (runtime.data.useRuntimeRepositories as jest.Mock).mockReturnValue({
        user: { observeItem, cacheRead, syncChannelUsers },
    });
    (runtime.connection.useCloudVerified as jest.Mock).mockReturnValue(true);
    (runtime.session.useUidInCloud as jest.Mock).mockReturnValue('me');
    setSelectedCloud('cloud-a');
});

describe('usePeerCloudNames', () => {
    it('names a peer from the user cache without asking the server', async () => {
        cache.set('peer', { id: 'peer', name: '임마' });

        const { result } = renderHook(() => usePeerCloudNames([row('c1', 'peer')]));

        expect(result.current.get('peer')).toBe('임마');
        await waitFor(() => expect(cacheRead).toHaveBeenCalledWith('peer'));
        expect(syncChannelUsers).not.toHaveBeenCalled();
    });

    // Nothing on a list fills the cache, so without this a never-opened 1:1 stayed unnamed.
    it("loads the room's members once for a peer the cache does not hold, and shows the result", async () => {
        syncChannelUsers.mockImplementation(async ({ channelId }: { channelId: string }) => {
            if (channelId === 'c1') emit('peer', { id: 'peer', name: '임마' });
            return 0;
        });

        const { result, rerender } = renderHook(({ rows }) => usePeerCloudNames(rows), {
            initialProps: { rows: [row('c1', 'peer')] },
        });

        await waitFor(() => expect(result.current.get('peer')).toBe('임마'));
        expect(syncChannelUsers).toHaveBeenCalledTimes(1);
        expect(syncChannelUsers).toHaveBeenCalledWith({ channelId: 'c1', since: 0 });

        rerender({ rows: [row('c1', 'peer')] });
        expect(syncChannelUsers).toHaveBeenCalledTimes(1);
    });

    it('asks nothing for a row the place profile already names', async () => {
        renderHook(() => usePeerCloudNames([row('c1', 'peer', 'webB')]));

        await act(async () => undefined);
        expect(cacheRead).not.toHaveBeenCalled();
        expect(syncChannelUsers).not.toHaveBeenCalled();
    });

    // The place profiles land just after the first render, so the first run sees every row unnamed.
    // The re-run that follows must neither load the row that got a nick nor lose the one still unnamed.
    it('skips a row whose place nick arrived during its cache read, and still loads the others', async () => {
        const finish = new Map<string, (user: null) => void>();
        cacheRead.mockImplementation((id: string) => new Promise(resolve => finish.set(id, resolve)));

        const { rerender } = renderHook(({ rows }) => usePeerCloudNames(rows), {
            initialProps: { rows: [row('c1', 'peer'), row('c2', 'other')] },
        });
        await waitFor(() => expect(finish.size).toBe(2));

        rerender({ rows: [row('c1', 'peer', 'webB'), row('c2', 'other')] });
        await act(async () => {
            finish.get('peer')?.(null);
            finish.get('other')?.(null);
        });

        expect(syncChannelUsers).toHaveBeenCalledTimes(1);
        expect(syncChannelUsers).toHaveBeenCalledWith({ channelId: 'c2', since: 0 });
    });

    // A placeholder-named record would come back the same, so a reload buys nothing.
    it('does not reload a room whose peer has a record, even one with no usable name', async () => {
        cache.set('peer', { id: 'peer', name: 'User_0101' });

        const { result } = renderHook(() => usePeerCloudNames([row('c1', 'peer')]));

        await waitFor(() => expect(cacheRead).toHaveBeenCalledWith('peer'));
        expect(syncChannelUsers).not.toHaveBeenCalled();
        expect(result.current.has('peer')).toBe(false);
    });

    it('waits for the socket before loading anything', async () => {
        (runtime.connection.useCloudVerified as jest.Mock).mockReturnValue(false);

        const { rerender } = renderHook(() => usePeerCloudNames([row('c1', 'peer')]));
        await act(async () => undefined);
        expect(syncChannelUsers).not.toHaveBeenCalled();

        (runtime.connection.useCloudVerified as jest.Mock).mockReturnValue(true);
        rerender();
        await waitFor(() => expect(syncChannelUsers).toHaveBeenCalledWith({ channelId: 'c1', since: 0 }));
    });

    it('asks again after a failed load once the rows change', async () => {
        syncChannelUsers.mockRejectedValueOnce(new Error('timeout'));

        const { rerender } = renderHook(({ rows }) => usePeerCloudNames(rows), {
            initialProps: { rows: [row('c1', 'peer')] },
        });
        await waitFor(() => expect(syncChannelUsers).toHaveBeenCalledTimes(1));
        await act(async () => undefined);

        rerender({ rows: [row('c1', 'peer'), row('c2', 'other')] });
        await waitFor(() =>
            expect(syncChannelUsers.mock.calls.filter(([input]) => input.channelId === 'c1')).toHaveLength(2)
        );
    });

    it('drops a name the cache no longer gives', async () => {
        cache.set('peer', { id: 'peer', name: '임마' });
        const { result } = renderHook(() => usePeerCloudNames([row('c1', 'peer')]));
        expect(result.current.get('peer')).toBe('임마');

        emit('peer', { id: 'peer', name: '***0101' });

        expect(result.current.has('peer')).toBe(false);
    });

    it('keeps the names of peers still listed when a row is added', () => {
        cache.set('peer', { id: 'peer', name: '임마' });
        // An asynchronous cache: nothing is emitted during the subscribe call.
        observeItem.mockImplementation((id: string, cb: (user: DomainUser | null) => void) => {
            observers.set(id, cb);
            return () => observers.delete(id);
        });
        const { result, rerender } = renderHook(({ rows }) => usePeerCloudNames(rows), {
            initialProps: { rows: [row('c1', 'peer')] },
        });
        act(() => observers.get('peer')?.(cache.get('peer') as DomainUser));
        expect(result.current.get('peer')).toBe('임마');

        rerender({ rows: [row('c1', 'peer'), row('c2', 'other')] });

        expect(result.current.get('peer')).toBe('임마');
    });
});

describe('usePeerCloudNames across a switch', () => {
    // The repository is the same object across clouds, so only the selection can tell them apart.
    it("never shows the previous cloud's names once the cloud changes, even for the same peer ids", () => {
        cache.set('peer', { id: 'peer', name: '임마' });
        const { result, rerender } = renderHook(({ rows }) => usePeerCloudNames(rows), {
            initialProps: { rows: [row('c1', 'peer')] },
        });
        expect(result.current.get('peer')).toBe('임마');

        // The next cloud's cache has not answered yet.
        observeItem.mockImplementation(() => () => undefined);
        setSelectedCloud('cloud-b');
        rerender({ rows: [row('c1', 'peer', undefined, 'cloud-b')] });

        expect(result.current.has('peer')).toBe(false);
        // Re-subscribed for the new cloud rather than kept on the old partition.
        expect(observeItem).toHaveBeenCalledTimes(2);
    });

    it('re-subscribes when my uid in the cloud changes (an account switch)', () => {
        cache.set('peer', { id: 'peer', name: '임마' });
        const { result, rerender } = renderHook(() => usePeerCloudNames([row('c1', 'peer')]));
        expect(result.current.get('peer')).toBe('임마');

        observeItem.mockImplementation(() => () => undefined);
        (runtime.session.useUidInCloud as jest.Mock).mockReturnValue('someone-else');
        rerender();

        expect(result.current.has('peer')).toBe(false);
        expect(observeItem).toHaveBeenCalledTimes(2);
    });

    it('ignores rows of a cloud other than the selected one — a list that lags a switch by a render', async () => {
        renderHook(() => usePeerCloudNames([row('c1', 'peer', undefined, 'cloud-old')]));

        await act(async () => undefined);
        expect(observeItem).not.toHaveBeenCalled();
        expect(cacheRead).not.toHaveBeenCalled();
        expect(syncChannelUsers).not.toHaveBeenCalled();
    });

    // Sent after the switch, the old cloud's room id would go out in the new cloud's session.
    it('does not send a load when the cloud changed while the cache was being read', async () => {
        let finishRead: (user: null) => void = () => undefined;
        cacheRead.mockImplementation(() => new Promise(resolve => (finishRead = resolve)));

        renderHook(() => usePeerCloudNames([row('c1', 'peer')]));
        await waitFor(() => expect(cacheRead).toHaveBeenCalledWith('peer'));

        (runtime.session.getGlobalSessionContext as jest.Mock).mockReturnValue({ cloud: { cloudId: 'cloud-b' } });
        await act(async () => finishRead(null));

        expect(syncChannelUsers).not.toHaveBeenCalled();
    });

    it('does not send a load after the list unmounted', async () => {
        let finishRead: (user: null) => void = () => undefined;
        cacheRead.mockImplementation(() => new Promise(resolve => (finishRead = resolve)));

        const { unmount } = renderHook(() => usePeerCloudNames([row('c1', 'peer')]));
        await waitFor(() => expect(cacheRead).toHaveBeenCalledWith('peer'));

        unmount();
        await act(async () => finishRead(null));

        expect(syncChannelUsers).not.toHaveBeenCalled();
    });
});
