import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook, waitFor } from '@testing-library/react';

import type { DomainChat } from '@chatic/data';

const getChat = vi.fn();
const warn = vi.fn();

vi.mock('@chatic/bridges', () => ({ logger: { warn: (...args: unknown[]) => warn(...args) } }));
vi.mock('@chatic/app-runtime', () => ({
    runtime: { data: { useRuntimeRepositories: () => ({ chat: { getChat } }) } },
}));

import { REPLY_PAGES_PER_BATCH, useThreadRoot } from './useThreadRoot';

const chat = (chatNo: number, extra: Partial<DomainChat> = {}): DomainChat =>
    ({ id: `C1:${chatNo}`, channelId: 'C1', chatNo, ownerId: 'ada', ...extra }) as DomainChat;

// A window whose oldest message is `oldest`. A new array each time, as the cache observer emits.
const windowFrom = (oldest: number): DomainChat[] => [chat(oldest), chat(2000)];

type Args = Parameters<typeof useThreadRoot>[0];

const baseArgs = (over: Partial<Args> = {}): Args => ({
    channelId: 'C1',
    rootId: '5',
    windowRoot: undefined,
    joinedNo: undefined,
    feedLoading: false,
    messages: windowFrom(1000),
    loadOlder: vi.fn().mockResolvedValue(true),
    hasMore: true,
    isLoadingOlder: false,
    ...over,
});

const mount = (over: Partial<Args> = {}) => {
    const initial = baseArgs(over);
    const view = renderHook((args: Args) => useThreadRoot(args), { initialProps: initial });
    return { ...view, initial };
};

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

describe('useThreadRoot — the root', () => {
    beforeEach(() => {
        getChat.mockReset().mockResolvedValue(chat(5, { content: 'old root' }));
        warn.mockClear();
    });

    it('asks for nothing when the root is already in the window', () => {
        const loadOlder = vi.fn();
        const { result } = mount({ windowRoot: chat(5), loadOlder });

        expect(result.current.status).toBe('found');
        expect(result.current.root?.chatNo).toBe(5);
        expect(result.current.replies).toBe('complete');
        expect(getChat).not.toHaveBeenCalled();
        expect(loadOlder).not.toHaveBeenCalled();
    });

    it('waits for the window to settle before deciding the root is outside it', async () => {
        const { result, rerender, initial } = mount({ feedLoading: true });

        expect(result.current.status).toBe('loading');
        expect(getChat).not.toHaveBeenCalled();

        rerender({ ...initial, feedLoading: false });
        await waitFor(() => expect(result.current.status).toBe('found'));
        expect(getChat).toHaveBeenCalledTimes(1);
    });

    it('fetches a root outside the window by its full id, once', async () => {
        const { result } = mount();

        expect(result.current.status).toBe('loading');
        await waitFor(() => expect(result.current.status).toBe('found'));

        expect(getChat).toHaveBeenCalledTimes(1);
        expect(getChat).toHaveBeenCalledWith({ id: 'C1:5' });
        expect(result.current.root?.content).toBe('old root');
    });

    it('takes a full id for the root too', async () => {
        const { result } = mount({ rootId: 'C1:5' });

        await waitFor(() => expect(result.current.status).toBe('found'));
        expect(getChat).toHaveBeenCalledWith({ id: 'C1:5' });
    });

    // The server will not serve a message from before my join window, and the number says so: asking
    // would only leave a spinner, so nothing is asked.
    it('does not ask for a root from before my membership', () => {
        const loadOlder = vi.fn();
        const { result } = mount({ joinedNo: 10, loadOlder });

        expect(result.current.status).toBe('beforeJoin');
        expect(getChat).not.toHaveBeenCalled();
        expect(loadOlder).not.toHaveBeenCalled();
    });

    it('asks for a root just inside the join window', async () => {
        const { result } = mount({ joinedNo: 4 });

        await waitFor(() => expect(result.current.status).toBe('found'));
        expect(getChat).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['not found', '404 NOT FOUND - chats/C1:5'],
        ['denied', '403 NOT ALLOWED - chat[get] is invalid'],
    ])('reads a %s answer as a message that is gone', async (_name, wire) => {
        getChat.mockRejectedValue(new Error(wire));
        const { result } = mount();

        await waitFor(() => expect(result.current.status).toBe('gone'));
        expect(getChat).toHaveBeenCalledTimes(1);
    });

    it('reads anything else as a failure that may pass, and a retry asks again', async () => {
        getChat.mockRejectedValueOnce(new Error('Failed to fetch'));
        const { result } = mount();

        await waitFor(() => expect(result.current.status).toBe('failed'));
        expect(getChat).toHaveBeenCalledTimes(1);

        act(() => result.current.retryRoot());
        await waitFor(() => expect(result.current.status).toBe('found'));
        expect(getChat).toHaveBeenCalledTimes(2);
        expect(getChat).toHaveBeenLastCalledWith({ id: 'C1:5' });
    });

    it('ignores a late answer for a thread the panel has left', async () => {
        const first = deferred<DomainChat>();
        const second = deferred<DomainChat>();
        getChat.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        const { result, rerender, initial } = mount();

        rerender({ ...initial, rootId: '7' });
        await act(async () => {
            first.resolve(chat(5, { content: 'root 5' }));
        });
        expect(result.current.status).toBe('loading');
        expect(result.current.root).toBeUndefined();

        await act(async () => {
            second.resolve(chat(7, { content: 'root 7' }));
        });
        expect(result.current.root?.content).toBe('root 7');
    });

    it('ignores a late answer for a channel the panel has left', async () => {
        const first = deferred<DomainChat>();
        getChat.mockReturnValueOnce(first.promise).mockReturnValue(new Promise(() => undefined));
        const { result, rerender, initial } = mount();

        rerender({ ...initial, channelId: 'C2' });
        await act(async () => {
            first.resolve(chat(5, { content: 'root of C1' }));
        });

        expect(result.current.status).toBe('loading');
        expect(result.current.root).toBeUndefined();
    });
});

describe('useThreadRoot — the replies', () => {
    beforeEach(() => {
        getChat.mockReset().mockResolvedValue(chat(5, { content: 'old root' }));
    });

    // Stands in for the cache observer: each landed page re-emits the window with 50 older rows.
    const pager = async (over: Partial<Args> = {}) => {
        const loadOlder = over.loadOlder ?? vi.fn().mockResolvedValue(true);
        const view = mount({ ...over, loadOlder });
        let oldest = 1000;
        await waitFor(() => expect(view.result.current.status).toBe('found'));
        const land = async () => {
            oldest -= 50;
            await act(async () => {
                view.rerender({ ...view.initial, messages: windowFrom(oldest) });
            });
        };
        return { ...view, loadOlder, land };
    };

    it('pages down toward the root on its own', async () => {
        const { result, loadOlder } = await pager();

        expect(loadOlder).toHaveBeenCalledTimes(1);
        expect(result.current.replies).toBe('loadingOlder');
    });

    it('does not ask for the next page until the last one has shown up in the window', async () => {
        const { loadOlder, rerender, initial, result } = await pager();

        // Same window re-rendered (e.g. the loading flag flipping): the page has not landed.
        rerender({ ...initial, loadOlder });
        rerender({ ...initial, loadOlder, isLoadingOlder: true });
        rerender({ ...initial, loadOlder });

        expect(loadOlder).toHaveBeenCalledTimes(1);
        expect(result.current.replies).toBe('loadingOlder');
    });

    it('stops after one batch and offers the rest, without resuming by itself', async () => {
        const { result, loadOlder, land } = await pager();

        for (let page = 0; page < REPLY_PAGES_PER_BATCH; page += 1) await land();

        expect(loadOlder).toHaveBeenCalledTimes(REPLY_PAGES_PER_BATCH);
        expect(result.current.replies).toBe('partial');
        // The root stays up the whole time: stopping is not failing.
        expect(result.current.status).toBe('found');
        expect(result.current.root?.chatNo).toBe(5);

        await act(async () => undefined);
        expect(loadOlder).toHaveBeenCalledTimes(REPLY_PAGES_PER_BATCH);
    });

    it('takes one more batch per press, and only one', async () => {
        const { result, loadOlder, land } = await pager();
        for (let page = 0; page < REPLY_PAGES_PER_BATCH; page += 1) await land();

        act(() => result.current.loadOlderReplies());
        expect(loadOlder).toHaveBeenCalledTimes(REPLY_PAGES_PER_BATCH + 1);
        expect(result.current.replies).toBe('loadingOlder');

        for (let page = 0; page < REPLY_PAGES_PER_BATCH; page += 1) await land();

        expect(loadOlder).toHaveBeenCalledTimes(REPLY_PAGES_PER_BATCH * 2);
        expect(result.current.replies).toBe('partial');
    });

    it('is complete once the window reaches the root', async () => {
        const { result, loadOlder, rerender, initial } = await pager();

        rerender({ ...initial, loadOlder, messages: windowFrom(5) });

        expect(result.current.replies).toBe('complete');
        expect(loadOlder).toHaveBeenCalledTimes(1);
    });

    it('is complete when there is nothing older to fetch, however far the root is', async () => {
        const loadOlder = vi.fn();
        const { result } = mount({ hasMore: false, loadOlder });

        await waitFor(() => expect(result.current.status).toBe('found'));

        expect(result.current.replies).toBe('complete');
        expect(loadOlder).not.toHaveBeenCalled();
    });

    it('leaves the thread as it is when an older page fails, and a press retries it', async () => {
        const loadOlder = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
        const { result } = await pager({ loadOlder });
        await waitFor(() => expect(result.current.replies).toBe('olderFailed'));

        expect(result.current.status).toBe('found');
        expect(result.current.root?.chatNo).toBe(5);
        expect(loadOlder).toHaveBeenCalledTimes(1);

        act(() => result.current.loadOlderReplies());

        expect(loadOlder).toHaveBeenCalledTimes(2);
        expect(result.current.replies).toBe('loadingOlder');
    });

    // The same feed observer re-emits on every cache write — the fetched root, a live message, a
    // reaction — so a new window that still starts at the same row says nothing about the page.
    it('keeps waiting through an emission that does not move the window, without failing or asking again', async () => {
        const { result, loadOlder, rerender, initial } = await pager();

        await act(async () => {
            rerender({ ...initial, loadOlder, messages: windowFrom(1000) });
        });
        await act(async () => {
            rerender({ ...initial, loadOlder, messages: windowFrom(1000) });
        });

        expect(result.current.replies).toBe('loadingOlder');
        expect(loadOlder).toHaveBeenCalledTimes(1);
    });

    it('does not mark a thread failed for a failure that comes back after the panel moved on', async () => {
        const late = deferred<boolean>();
        const loadOlder = vi.fn().mockReturnValueOnce(late.promise).mockResolvedValue(true);
        getChat.mockImplementation(({ id }: { id: string }) => Promise.resolve(chat(Number(id.split(':')[1]))));
        const { result, rerender, initial } = mount({ loadOlder });
        await waitFor(() => expect(result.current.root?.chatNo).toBe(5));

        rerender({ ...initial, loadOlder, rootId: '7' });
        await waitFor(() => expect(result.current.root?.chatNo).toBe(7));
        rerender({ ...initial, loadOlder });
        await waitFor(() => expect(result.current.root?.chatNo).toBe(5));
        await act(async () => late.resolve(false));

        expect(result.current.replies).not.toBe('olderFailed');
    });

    it('starts over for another thread', async () => {
        const { result, loadOlder, land, rerender, initial } = await pager();
        for (let page = 0; page < REPLY_PAGES_PER_BATCH; page += 1) await land();
        expect(result.current.replies).toBe('partial');

        getChat.mockResolvedValue(chat(7, { content: 'another root' }));
        rerender({ ...initial, loadOlder, rootId: '7', messages: windowFrom(1000) });

        await waitFor(() => expect(result.current.root?.chatNo).toBe(7));
        expect(result.current.replies).toBe('loadingOlder');
    });
});
