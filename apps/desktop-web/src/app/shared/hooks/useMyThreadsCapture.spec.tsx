import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook, waitFor } from '@testing-library/react';

const ACCOUNT_UID = 'acct-1';
const CLOUD_UID = 'cloud-user-9';

let feedHandler: ((feed: unknown) => void) | null = null;
const cacheRead = vi.fn();
const getChat = vi.fn();
const chatCacheReadList = vi.fn();
const channelCacheReadList = vi.fn();
let cloudId = 'cloud-a';
const otherCloudRepositories = {
    chat: { cacheRead: vi.fn(), getChat: vi.fn(), cacheReadList: vi.fn().mockResolvedValue({ list: [] }) },
    channel: { cacheReadList: vi.fn().mockResolvedValue({ list: [] }) },
};

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            getGlobalSessionContext: () => ({ identity: { userId: ACCOUNT_UID } }),
            useGlobalSession: () => ({ cloud: { cloudId } }),
        },
        // Bound to the cloud each read names; the selected cloud's graph is never read.
        data: {
            getCloudRepositories: (cid: string) =>
                cid === 'cloud-a'
                    ? {
                          chat: { cacheRead, getChat, cacheReadList: chatCacheReadList },
                          channel: { cacheReadList: channelCacheReadList },
                      }
                    : otherCloudRepositories,
        },
    },
}));

const warn = vi.fn();
vi.mock('@chatic/bridges', () => ({ logger: { warn: (...args: unknown[]) => warn(...args) } }));

vi.mock('./useChannelChatFeeds', () => ({
    useChannelChatFeeds: (handler: (feed: unknown) => void) => {
        feedHandler = handler;
    },
}));

import '../../../i18n';

import { isThreadUnread, myThreadKey } from '../utils';
import { useMyThreadsStore } from '../stores';
import { useMyThreadsCapture } from './useMyThreadsCapture';

const KEY = myThreadKey('cloud-a', 'ch-1', '3');

const feed = (chat: Record<string, unknown>) => ({
    placeId: 'place-1',
    channel: { id: 'ch-1', cid: 'cloud-a', $join: { userId: CLOUD_UID } },
    chat: {
        id: 'ch-1:5',
        chatNo: 5,
        parentId: '3',
        content: 'a reply',
        ownerId: 'someone',
        owner$: { id: 'someone', name: 'Bob' },
        createdAt: 500,
        ...chat,
    },
});

const rootBy = (ownerId: string) => ({
    id: 'ch-1:3',
    chatNo: 3,
    content: 'the root',
    ownerId,
    owner$: { id: ownerId },
});

const held = () => useMyThreadsStore.getState().threads[KEY];

beforeEach(() => {
    feedHandler = null;
    cacheRead.mockReset().mockResolvedValue(null);
    getChat.mockReset();
    warn.mockReset();
    cloudId = 'cloud-a';
    chatCacheReadList.mockReset().mockResolvedValue({ list: [] });
    channelCacheReadList.mockReset().mockResolvedValue({ list: [] });
    useMyThreadsStore.setState({ threads: {}, backfilled: {} });
});

describe('useMyThreadsCapture', () => {
    beforeEach(() => {
        renderHook(() => useMyThreadsCapture());
    });

    it('adds a thread whose root is mine when someone replies, as a new reply', async () => {
        cacheRead.mockResolvedValue(rootBy(CLOUD_UID));

        feedHandler?.(feed({}));

        await waitFor(() => expect(held()).toBeDefined());
        expect(cacheRead).toHaveBeenCalledWith('ch-1:3');
        expect(held()).toMatchObject({
            placeId: 'place-1',
            rootPreview: 'the root',
            lastReplyNo: 5,
            lastReplyPreview: 'a reply',
            lastReplyOwnerName: 'Bob',
            lastActivityAt: 500,
        });
        expect(isThreadUnread(held())).toBe(true);
    });

    it('leaves out a thread whose root is from before my current join, without reading it', async () => {
        cacheRead.mockResolvedValue(rootBy(CLOUD_UID));

        feedHandler?.({
            ...feed({}),
            channel: { id: 'ch-1', cid: 'cloud-a', $join: { userId: CLOUD_UID, joinedNo: 4 } },
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(held()).toBeUndefined();
        expect(cacheRead).not.toHaveBeenCalled();
    });

    it('asks the server for a root the cache does not hold', async () => {
        getChat.mockResolvedValue(rootBy(ACCOUNT_UID));

        feedHandler?.(feed({}));

        await waitFor(() => expect(held()).toBeDefined());
        expect(getChat).toHaveBeenCalledWith({ id: 'ch-1:3' });
    });

    it('leaves out a thread that is neither mine nor one I replied in, and asks about it once', async () => {
        cacheRead.mockResolvedValue(rootBy('someone-else'));

        feedHandler?.(feed({}));
        // Let the first lookup settle, so the second reply meets the remembered verdict, not the
        // lookup still in flight.
        await new Promise(resolve => setTimeout(resolve, 0));
        feedHandler?.(feed({ id: 'ch-1:6', chatNo: 6 }));
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(held()).toBeUndefined();
        expect(cacheRead).toHaveBeenCalledTimes(1);
    });

    it('adds a thread where the reply is mine, from another device, as read', async () => {
        cacheRead.mockResolvedValue(rootBy('someone-else'));

        feedHandler?.(feed({ ownerId: CLOUD_UID, owner$: { id: CLOUD_UID, name: 'Me' } }));

        await waitFor(() => expect(held()).toBeDefined());
        expect(isThreadUnread(held())).toBe(false);
    });

    it('updates a held thread without looking up its root again', () => {
        useMyThreadsStore.getState().record(
            {
                cid: 'cloud-a',
                channelId: 'ch-1',
                rootNo: '3',
                replyNo: 4,
                preview: 'x',
                ownerName: 'Me',
                at: 1,
                mine: true,
            },
            { root: { preview: 'the root', ownerName: 'Ada' } }
        );

        feedHandler?.(feed({}));

        expect(cacheRead).not.toHaveBeenCalled();
        expect(held()).toMatchObject({ lastReplyNo: 5 });
        expect(isThreadUnread(held())).toBe(true);
    });

    it('ignores top-level messages, reactions and system rows', () => {
        feedHandler?.(feed({ parentId: undefined }));
        feedHandler?.(feed({ subType: 'reaction' }));
        feedHandler?.(feed({ stereo: 'system' }));

        expect(cacheRead).not.toHaveBeenCalled();
    });

    it('skips a thread whose root cannot be read, says so, and asks again on the next reply', async () => {
        getChat.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(rootBy(CLOUD_UID));

        feedHandler?.(feed({}));
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(held()).toBeUndefined();
        expect(warn).toHaveBeenCalledWith('CHAT', expect.stringContaining('capture failed'), expect.anything());

        feedHandler?.(feed({ id: 'ch-1:6', chatNo: 6 }));

        await waitFor(() => expect(held()).toBeDefined());
        expect(getChat).toHaveBeenCalledTimes(2);
    });

    it("adds someone else's thread once I reply in it, though it was set aside before", async () => {
        cacheRead.mockResolvedValue(rootBy('someone-else'));
        feedHandler?.(feed({}));
        await new Promise(resolve => setTimeout(resolve, 0));

        feedHandler?.(feed({ id: 'ch-1:6', chatNo: 6, ownerId: CLOUD_UID, owner$: { id: CLOUD_UID, name: 'Me' } }));

        await waitFor(() => expect(held()).toMatchObject({ lastReplyNo: 6 }));
    });

    it('keeps my reply that lands while the root of that thread is still being read', async () => {
        let answer: (root: unknown) => void = () => undefined;
        cacheRead.mockReturnValue(new Promise(resolve => (answer = resolve)));
        feedHandler?.(feed({}));

        feedHandler?.(feed({ id: 'ch-1:6', chatNo: 6, ownerId: CLOUD_UID, owner$: { id: CLOUD_UID, name: 'Me' } }));
        answer(rootBy('someone-else'));

        await waitFor(() => expect(held()).toMatchObject({ lastReplyNo: 6 }));
        expect(isThreadUnread(held())).toBe(false);
    });
});

describe('useMyThreadsCapture backfill', () => {
    const cachedChannel = { id: 'ch-2', cid: 'cloud-a', sid: 'place-2', $join: { userId: CLOUD_UID } };
    const rows = [
        { id: 'ch-2:1', channelId: 'ch-2', chatNo: 1, content: 'my question', ownerId: CLOUD_UID },
        { id: 'ch-2:2', channelId: 'ch-2', chatNo: 2, parentId: '1', content: 'an answer', ownerId: 'bob' },
    ];

    it("lists the threads already in the active cloud's cache, as read, once", async () => {
        channelCacheReadList.mockResolvedValue({ list: [cachedChannel] });
        chatCacheReadList.mockResolvedValue({ list: rows });

        const { rerender } = renderHook(() => useMyThreadsCapture());

        await waitFor(() => expect(useMyThreadsStore.getState().backfilled).toEqual({ 'cloud-a': true }));
        const thread = useMyThreadsStore.getState().threads[myThreadKey('cloud-a', 'ch-2', '1')];
        expect(thread).toMatchObject({ placeId: 'place-2', rootPreview: 'my question', lastReplyNo: 2 });
        expect(isThreadUnread(thread)).toBe(false);

        rerender();
        renderHook(() => useMyThreadsCapture());
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(channelCacheReadList).toHaveBeenCalledTimes(1);
    });

    it('leaves out cached threads from before my current join', async () => {
        channelCacheReadList.mockResolvedValue({
            list: [{ ...cachedChannel, $join: { userId: CLOUD_UID, joinedNo: 1 } }],
        });
        chatCacheReadList.mockResolvedValue({ list: rows });

        renderHook(() => useMyThreadsCapture());

        await waitFor(() => expect(useMyThreadsStore.getState().backfilled).toEqual({ 'cloud-a': true }));
        expect(useMyThreadsStore.getState().threads).toEqual({});
    });

    it('reads the cloud it backfills, whichever cloud the app is showing', async () => {
        cloudId = 'cloud-b';

        renderHook(() => useMyThreadsCapture());

        await waitFor(() => expect(otherCloudRepositories.channel.cacheReadList).toHaveBeenCalled());
        expect(channelCacheReadList).not.toHaveBeenCalled();
    });

    it('waits for a cloud whose channels are not cached yet', async () => {
        renderHook(() => useMyThreadsCapture());

        await waitFor(() => expect(channelCacheReadList).toHaveBeenCalled());
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(useMyThreadsStore.getState().backfilled).toEqual({});
    });

    it('goes on past a channel whose cache cannot be read', async () => {
        channelCacheReadList.mockResolvedValue({ list: [{ ...cachedChannel, id: 'ch-bad' }, cachedChannel] });
        chatCacheReadList.mockImplementation(({ channelId }: { channelId: string }) =>
            channelId === 'ch-bad' ? Promise.reject(new Error('idb')) : Promise.resolve({ list: rows })
        );

        renderHook(() => useMyThreadsCapture());

        await waitFor(() => expect(useMyThreadsStore.getState().backfilled).toEqual({ 'cloud-a': true }));
        expect(useMyThreadsStore.getState().threads[myThreadKey('cloud-a', 'ch-2', '1')]).toBeDefined();
    });
});
