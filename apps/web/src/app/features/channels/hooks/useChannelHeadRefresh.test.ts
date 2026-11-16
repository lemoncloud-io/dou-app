import { act, renderHook } from '@testing-library/react';

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        sync: { fetchRoomFeed: jest.fn() },
        connection: { useRuntimeSocketState: jest.fn() },
        session: { getGlobalSessionContext: jest.fn() },
    },
}));
jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { runtime } from '@chatic/app-runtime';

import { useChannelHeadRefresh, type ChannelHeadRefreshParams } from './useChannelHeadRefresh';

const fetchRoomFeed = runtime.sync.fetchRoomFeed as jest.Mock;

const setVerified = (isVerified: boolean) =>
    (runtime.connection.useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified });
const setSelectedCloud = (cid: string) =>
    (runtime.session.getGlobalSessionContext as jest.Mock).mockReturnValue({ cloud: { cloudId: cid } });
const pageUpTo = (latestNo: number) => ({ fetchedCount: 1, latestNo, total: latestNo });

const base: ChannelHeadRefreshParams = { channelId: 'ch-1', channelChatNo: 5, cachedNewestNo: 4, isCacheRead: true };

// Renders and lets the fetch chain (two awaits deep at most) settle.
const render = async (initial: ChannelHeadRefreshParams) => {
    let hook!: ReturnType<typeof renderHook<void, ChannelHeadRefreshParams>>;
    await act(async () => {
        hook = renderHook((props: ChannelHeadRefreshParams) => useChannelHeadRefresh(props), { initialProps: initial });
    });
    return {
        rerender: async (next: ChannelHeadRefreshParams) => {
            await act(async () => {
                hook.rerender(next);
            });
        },
    };
};

beforeEach(() => {
    jest.clearAllMocks();
    setVerified(true);
    setSelectedCloud('cloud-a');
    fetchRoomFeed.mockResolvedValue(pageUpTo(5));
});

describe('useChannelHeadRefresh', () => {
    it('fetches the newest page when the channel record is ahead of the cache', async () => {
        await render(base);

        expect(fetchRoomFeed).toHaveBeenCalledTimes(1);
        expect(fetchRoomFeed).toHaveBeenCalledWith('cloud-a', 'ch-1', { cache: 'hit' });
    });

    it('does nothing while the cache is level with the channel record', async () => {
        await render({ ...base, channelChatNo: 4 });

        expect(fetchRoomFeed).not.toHaveBeenCalled();
    });

    it('leaves a cold room to the prime', async () => {
        await render({ ...base, cachedNewestNo: 0 });

        expect(fetchRoomFeed).not.toHaveBeenCalled();
    });

    it('waits for the cache window to be read and for the socket to verify', async () => {
        setVerified(false);
        const hook = await render({ ...base, isCacheRead: false });
        expect(fetchRoomFeed).not.toHaveBeenCalled();

        await hook.rerender({ ...base, isCacheRead: true });
        expect(fetchRoomFeed).not.toHaveBeenCalled();

        setVerified(true);
        await hook.rerender({ ...base });
        expect(fetchRoomFeed).toHaveBeenCalledTimes(1);
    });

    it('asks once per number, even while the cache never catches up to it', async () => {
        const hook = await render(base);
        // A cache emission that did not bring the number in (it was a deleted message, say).
        await hook.rerender({ ...base, cachedNewestNo: 4 });
        await hook.rerender({ ...base });

        expect(fetchRoomFeed).toHaveBeenCalledTimes(1);
    });

    it('asks again when the channel record moves on to a newer number', async () => {
        const hook = await render(base);
        fetchRoomFeed.mockResolvedValue(pageUpTo(6));

        await hook.rerender({ ...base, channelChatNo: 6, cachedNewestNo: 5 });

        expect(fetchRoomFeed).toHaveBeenCalledTimes(2);
    });

    it('sends one fresh request when the joined page stops short of the number', async () => {
        // A page that finished just before the number moved, handed back to a joining caller.
        fetchRoomFeed.mockResolvedValueOnce(pageUpTo(4)).mockResolvedValueOnce(pageUpTo(5));

        await render(base);

        expect(fetchRoomFeed).toHaveBeenCalledTimes(2);
        expect(fetchRoomFeed).toHaveBeenLastCalledWith('cloud-a', 'ch-1', { cache: 'hit', fresh: true });
    });

    it('skips the fresh request when the cache caught up while the joined page was out', async () => {
        let answer!: (value: unknown) => void;
        fetchRoomFeed.mockReturnValueOnce(new Promise(resolve => (answer = resolve)));
        const hook = await render(base);

        // A push brings the row in before the joined page comes back without it.
        await hook.rerender({ ...base, cachedNewestNo: 5 });
        await act(async () => {
            answer(pageUpTo(4));
        });

        expect(fetchRoomFeed).toHaveBeenCalledTimes(1);
    });

    it('sends no fresh request for a room already left', async () => {
        let answer!: (value: unknown) => void;
        fetchRoomFeed.mockReturnValueOnce(new Promise(resolve => (answer = resolve)));
        let hook!: ReturnType<typeof renderHook<void, ChannelHeadRefreshParams>>;
        await act(async () => {
            hook = renderHook((props: ChannelHeadRefreshParams) => useChannelHeadRefresh(props), {
                initialProps: base,
            });
        });

        hook.unmount();
        await act(async () => {
            answer(pageUpTo(4));
        });

        expect(fetchRoomFeed).toHaveBeenCalledTimes(1);
    });

    it('sends no fresh request for the previous room after a switch', async () => {
        let answer!: (value: unknown) => void;
        fetchRoomFeed.mockReturnValueOnce(new Promise(resolve => (answer = resolve)));
        const hook = await render(base);

        // The next room is level with its record, so it asks for nothing itself.
        await hook.rerender({ ...base, channelId: 'ch-2', channelChatNo: 3, cachedNewestNo: 3 });
        await act(async () => {
            answer(pageUpTo(4));
        });

        expect(fetchRoomFeed).toHaveBeenCalledTimes(1);
    });

    it('gives the number back after a failed fetch, so the next change tries again', async () => {
        fetchRoomFeed.mockRejectedValueOnce(new Error('timeout'));
        const hook = await render(base);
        expect(fetchRoomFeed).toHaveBeenCalledTimes(1);

        // The next chance: any change to either side re-runs the check.
        await hook.rerender({ ...base, cachedNewestNo: 3 });

        expect(fetchRoomFeed).toHaveBeenCalledTimes(2);
    });

    it('remembers the number per channel, so another room is still checked', async () => {
        const hook = await render(base);

        await hook.rerender({ ...base, channelId: 'ch-2' });

        expect(fetchRoomFeed).toHaveBeenCalledTimes(2);
        expect(fetchRoomFeed).toHaveBeenLastCalledWith('cloud-a', 'ch-2', { cache: 'hit' });
    });
});
