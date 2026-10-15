import { act, renderHook } from '@testing-library/react';

import { useMessageJumpStore } from '../../../stores/useMessageJumpStore';
import { useMessageJump } from './useMessageJump';
import type { ClientChatView } from '../types';

const toast = jest.fn();
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: (...args: unknown[]) => toast(...args) }));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));

const messages: ClientChatView[] = [];

const setup = (chatNo?: number): { current: HTMLDivElement } => {
    const container = document.createElement('div');
    if (chatNo !== undefined) {
        const node = document.createElement('div');
        node.setAttribute('data-chat-no', String(chatNo));
        // jsdom doesn't implement scrollIntoView.
        node.scrollIntoView = jest.fn();
        container.appendChild(node);
    }
    document.body.appendChild(container);
    return { current: container };
};

const loadMore = jest.fn();
// Default: the window already reaches that far, so the jump falls through to paging.
const loadUntil = jest.fn(() => false);

beforeEach(() => {
    jest.clearAllMocks();
    loadUntil.mockReturnValue(false);
    jest.useFakeTimers();
    document.body.innerHTML = '';
    useMessageJumpStore.setState({ target: null });
});

afterEach(() => {
    jest.useRealTimers();
});

describe('useMessageJump', () => {
    it('does nothing when there is no pending target', () => {
        const containerRef = setup();
        renderHook(() =>
            useMessageJump({
                channelId: 'ch-1',
                containerRef,
                messages,
                hasMore: true,
                isLoadingMore: false,
                loadMore,
                loadUntil,
            })
        );
        expect(loadMore).not.toHaveBeenCalled();
    });

    it('ignores a target that belongs to a different channel', () => {
        const containerRef = setup(5);
        useMessageJumpStore.getState().request('ch-OTHER', 5);

        renderHook(() =>
            useMessageJump({
                channelId: 'ch-1',
                containerRef,
                messages,
                hasMore: true,
                isLoadingMore: false,
                loadMore,
                loadUntil,
            })
        );

        expect(loadMore).not.toHaveBeenCalled();
        expect(useMessageJumpStore.getState().target).not.toBeNull();
    });

    it('scrolls to and highlights the target node when already loaded, then clears the store', () => {
        const containerRef = setup(5);
        const node = containerRef.current.querySelector('[data-chat-no="5"]') as HTMLElement;
        node.scrollIntoView = jest.fn();
        useMessageJumpStore.getState().request('ch-1', 5);

        renderHook(() =>
            useMessageJump({
                channelId: 'ch-1',
                containerRef,
                messages,
                hasMore: true,
                isLoadingMore: false,
                loadMore,
                loadUntil,
            })
        );

        expect(node.scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
        expect(node.classList.contains('bg-primary/10')).toBe(true);
        expect(useMessageJumpStore.getState().target).toBeNull();
        expect(loadMore).not.toHaveBeenCalled();

        act(() => jest.advanceTimersByTime(1600));
        expect(node.classList.contains('bg-primary/10')).toBe(false);
    });

    it('pages older when the target is not yet loaded, up to the budget', () => {
        const containerRef = setup(); // target chatNo never appears
        useMessageJumpStore.getState().request('ch-1', 999);

        const { rerender } = renderHook(
            ({ hasMore, isLoadingMore }) =>
                useMessageJump({
                    channelId: 'ch-1',
                    containerRef,
                    messages,
                    hasMore,
                    isLoadingMore,
                    loadMore,
                    loadUntil,
                }),
            { initialProps: { hasMore: true, isLoadingMore: false } }
        );

        expect(loadMore).toHaveBeenCalledTimes(1);

        // Simulate 7 more pages landing (budget = 8 total) without ever finding the node.
        for (let i = 0; i < 7; i += 1) {
            rerender({ hasMore: true, isLoadingMore: false });
        }
        expect(loadMore).toHaveBeenCalledTimes(8);

        // Budget exhausted: no further loadMore calls, a failure toast fires, store clears.
        rerender({ hasMore: true, isLoadingMore: false });
        expect(loadMore).toHaveBeenCalledTimes(8);
        expect(toast).toHaveBeenCalledWith({ title: expect.any(String) });
        expect(useMessageJumpStore.getState().target).toBeNull();
    });

    it('waits for the last page of its budget to land before giving up', () => {
        const containerRef = setup();
        useMessageJumpStore.getState().request('ch-1', 999);

        const { rerender } = renderHook(
            ({ hasMore, isLoadingMore }) =>
                useMessageJump({
                    channelId: 'ch-1',
                    containerRef,
                    messages,
                    hasMore,
                    isLoadingMore,
                    loadMore,
                    loadUntil,
                }),
            { initialProps: { hasMore: true, isLoadingMore: false } }
        );
        for (let i = 0; i < 7; i += 1) rerender({ hasMore: true, isLoadingMore: false });
        expect(loadMore).toHaveBeenCalledTimes(8);

        // The eighth page is still landing: its rows may hold the target.
        rerender({ hasMore: true, isLoadingMore: true });
        expect(toast).not.toHaveBeenCalled();

        rerender({ hasMore: true, isLoadingMore: false });
        expect(toast).toHaveBeenCalledTimes(1);
    });

    it('does not give up on the last page of history while it is still landing', () => {
        const containerRef = setup();
        useMessageJumpStore.getState().request('ch-1', 999);

        const { rerender } = renderHook(
            ({ hasMore, isLoadingMore }) =>
                useMessageJump({
                    channelId: 'ch-1',
                    containerRef,
                    messages,
                    hasMore,
                    isLoadingMore,
                    loadMore,
                    loadUntil,
                }),
            { initialProps: { hasMore: false, isLoadingMore: true } }
        );
        expect(toast).not.toHaveBeenCalled();

        rerender({ hasMore: false, isLoadingMore: false });
        expect(toast).toHaveBeenCalledTimes(1);
    });

    it('does not spend its budget while no page can be sent, and pages once one can', () => {
        const containerRef = setup();
        useMessageJumpStore.getState().request('ch-1', 999);

        const { rerender } = renderHook(
            ({ canLoadMore }) =>
                useMessageJump({
                    channelId: 'ch-1',
                    containerRef,
                    messages,
                    hasMore: true,
                    isLoadingMore: false,
                    loadMore,
                    canLoadMore,
                    loadUntil,
                }),
            { initialProps: { canLoadMore: false } }
        );
        expect(loadMore).not.toHaveBeenCalled();
        expect(toast).not.toHaveBeenCalled();

        rerender({ canLoadMore: true });
        expect(loadMore).toHaveBeenCalledTimes(1);
        // Someone asked to see this message: a failed page's retry wait does not hold it.
        expect(loadMore).toHaveBeenCalledWith({ immediate: true });
    });

    it('widens the cache window before paging, and waits for it', () => {
        // The target normally came from a cache search, so it is already stored locally — only the
        // observe window was too narrow. Paging the server for it wasted the jump budget.
        const containerRef = setup();
        loadUntil.mockReturnValue(true);
        useMessageJumpStore.getState().request('ch-1', 999);

        renderHook(() =>
            useMessageJump({
                channelId: 'ch-1',
                containerRef,
                messages,
                hasMore: true,
                isLoadingMore: false,
                loadMore,
                loadUntil,
            })
        );

        expect(loadUntil).toHaveBeenCalledWith(999);
        expect(loadMore).not.toHaveBeenCalled();
        expect(toast).not.toHaveBeenCalled();
        expect(useMessageJumpStore.getState().target).not.toBeNull();
    });

    it('stops immediately and shows a toast when history runs out before the budget', () => {
        const containerRef = setup();
        useMessageJumpStore.getState().request('ch-1', 999);

        renderHook(() =>
            useMessageJump({
                channelId: 'ch-1',
                containerRef,
                messages,
                hasMore: false,
                isLoadingMore: false,
                loadMore,
                loadUntil,
            })
        );

        expect(loadMore).not.toHaveBeenCalled();
        expect(toast).toHaveBeenCalledWith({ title: expect.any(String) });
        expect(useMessageJumpStore.getState().target).toBeNull();
    });

    it('tells the surface it gave up, and only then', () => {
        const onGiveUp = jest.fn();
        const found = setup(5);
        useMessageJumpStore.getState().request('ch-1', 5);
        const params = {
            channelId: 'ch-1',
            messages,
            hasMore: false,
            isLoadingMore: false,
            loadMore,
            loadUntil,
            onGiveUp,
        };

        renderHook(() => useMessageJump({ ...params, containerRef: found }));
        expect(onGiveUp).not.toHaveBeenCalled();

        useMessageJumpStore.getState().request('ch-1', 999);
        renderHook(() => useMessageJump({ ...params, containerRef: setup() }));
        expect(onGiveUp).toHaveBeenCalledTimes(1);
    });

    it('does not page while a page is already loading', () => {
        const containerRef = setup();
        useMessageJumpStore.getState().request('ch-1', 999);

        renderHook(() =>
            useMessageJump({
                channelId: 'ch-1',
                containerRef,
                messages,
                hasMore: true,
                isLoadingMore: true,
                loadMore,
                loadUntil,
            })
        );

        expect(loadMore).not.toHaveBeenCalled();
    });

    it('re-fires on a repeat jump to the same message (nonce bump)', () => {
        const containerRef = setup(5);
        const node = containerRef.current.querySelector('[data-chat-no="5"]') as HTMLElement;
        node.scrollIntoView = jest.fn();
        useMessageJumpStore.getState().request('ch-1', 5);

        const { rerender } = renderHook(
            () =>
                useMessageJump({
                    channelId: 'ch-1',
                    containerRef,
                    messages,
                    hasMore: true,
                    isLoadingMore: false,
                    loadMore,
                    loadUntil,
                }),
            { initialProps: {} }
        );
        expect(node.scrollIntoView).toHaveBeenCalledTimes(1);

        act(() => {
            useMessageJumpStore.getState().request('ch-1', 5);
        });
        rerender({});
        expect(node.scrollIntoView).toHaveBeenCalledTimes(2);
    });

    describe('a target from before my current membership', () => {
        it('gives up without paging, and says why rather than claiming a deletion', () => {
            // The row is not rendered, so without the window check this would page for it.
            const containerRef = setup();
            useMessageJumpStore.getState().request('ch-1', 5);

            renderHook(() =>
                useMessageJump({
                    channelId: 'ch-1',
                    containerRef,
                    messages,
                    hasMore: true,
                    isLoadingMore: false,
                    loadMore,
                    loadUntil,
                    joinedNo: 9,
                })
            );

            expect(loadMore).not.toHaveBeenCalled();
            expect(loadUntil).not.toHaveBeenCalled();
            expect(toast).toHaveBeenCalledTimes(1);
            // The copy this names says the message is from before the rejoin, NOT that it was
            // deleted — see the locale entry and the reasoning in the hook.
            const [{ title }] = toast.mock.calls[0] as [{ title: string }];
            expect(title).toBe('chat.jumpOutsideJoinWindow');
            expect(useMessageJumpStore.getState().target).toBeNull();
        });

        it('still jumps to a target above the cursor', () => {
            const containerRef = setup(12);
            useMessageJumpStore.getState().request('ch-1', 12);

            renderHook(() =>
                useMessageJump({
                    channelId: 'ch-1',
                    containerRef,
                    messages,
                    hasMore: true,
                    isLoadingMore: false,
                    loadMore,
                    loadUntil,
                    joinedNo: 9,
                })
            );

            expect(containerRef.current.firstElementChild?.scrollIntoView).toHaveBeenCalled();
            expect(toast).not.toHaveBeenCalled();
        });

        it('leaves a room with no cursor alone — an absent field never hides history', () => {
            const containerRef = setup();
            useMessageJumpStore.getState().request('ch-1', 5);

            renderHook(() =>
                useMessageJump({
                    channelId: 'ch-1',
                    containerRef,
                    messages,
                    hasMore: true,
                    isLoadingMore: false,
                    loadMore,
                    loadUntil,
                })
            );

            expect(loadMore).toHaveBeenCalled();
            expect(toast).not.toHaveBeenCalled();
        });
    });

    describe('a target in a stretch the cache never held', () => {
        it('asks for its own page once before paging below — older pages cannot reach a gap', () => {
            const containerRef = setup();
            const fetchThrough = jest.fn().mockResolvedValue(true);
            useMessageJumpStore.getState().request('ch-1', 500);
            const onScreen = [{ id: 'ch-1:900', chatNo: 900 } as ClientChatView];
            const params = {
                channelId: 'ch-1',
                containerRef,
                messages: onScreen,
                hasMore: true,
                isLoadingMore: false,
                loadMore,
                loadUntil,
                isFetched: () => false,
                fetchThrough,
            };

            const { rerender } = renderHook(p => useMessageJump(p), { initialProps: params });
            expect(fetchThrough).toHaveBeenCalledWith(500);
            expect(loadMore).not.toHaveBeenCalled();

            // The page landed without the target: paging below is still tried, and the page not again.
            rerender({ ...params, messages: [...onScreen] });
            expect(fetchThrough).toHaveBeenCalledTimes(1);
            expect(loadMore).toHaveBeenCalled();
        });

        it('does not take the target for uncached before the cache has answered', () => {
            const containerRef = setup();
            const fetchThrough = jest.fn();
            useMessageJumpStore.getState().request('ch-1', 50);

            renderHook(() =>
                useMessageJump({
                    channelId: 'ch-1',
                    containerRef,
                    messages: [],
                    hasMore: true,
                    isLoadingMore: false,
                    loadMore,
                    loadUntil,
                    isFetched: () => false,
                    fetchThrough,
                })
            );

            expect(fetchThrough).not.toHaveBeenCalled();
        });

        it('pages as before when a page already answered for the number', () => {
            const containerRef = setup();
            const fetchThrough = jest.fn();
            useMessageJumpStore.getState().request('ch-1', 500);

            renderHook(() =>
                useMessageJump({
                    channelId: 'ch-1',
                    containerRef,
                    messages,
                    hasMore: true,
                    isLoadingMore: false,
                    loadMore,
                    loadUntil,
                    isFetched: () => true,
                    fetchThrough,
                })
            );

            expect(fetchThrough).not.toHaveBeenCalled();
            expect(loadMore).toHaveBeenCalled();
        });
    });

    describe('a target that is a thread reply', () => {
        it('is left alone by the room, which never draws a reply', () => {
            const containerRef = setup();
            useMessageJumpStore.getState().request('ch-1', 5, { threadRootNo: '3' });

            renderHook(() =>
                useMessageJump({
                    channelId: 'ch-1',
                    containerRef,
                    messages,
                    hasMore: true,
                    isLoadingMore: false,
                    loadMore,
                    loadUntil,
                })
            );

            expect(loadUntil).not.toHaveBeenCalled();
            expect(loadMore).not.toHaveBeenCalled();
            expect(toast).not.toHaveBeenCalled();
            expect(useMessageJumpStore.getState().target).not.toBeNull();
        });

        it('is taken by the thread it names, which scrolls to the reply', () => {
            const containerRef = setup(5);
            useMessageJumpStore.getState().request('ch-1', 5, { threadRootNo: '3' });

            renderHook(() =>
                useMessageJump({
                    channelId: 'ch-1',
                    containerRef,
                    messages,
                    hasMore: true,
                    isLoadingMore: false,
                    loadMore,
                    loadUntil,
                    threadRootNo: '3',
                })
            );

            expect(containerRef.current.firstElementChild?.scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
            expect(useMessageJumpStore.getState().target).toBeNull();
        });

        it('is dropped when its thread closes before reaching it, so a later open does not replay it', () => {
            const containerRef = setup();
            useMessageJumpStore.getState().request('ch-1', 5, { threadRootNo: '3' });
            const params = {
                channelId: 'ch-1',
                containerRef,
                messages,
                hasMore: true,
                isLoadingMore: false,
                loadMore,
                canLoadMore: false,
                loadUntil,
            };

            // The room unmounting leaves the thread's target alone…
            renderHook(() => useMessageJump(params)).unmount();
            expect(useMessageJumpStore.getState().target).not.toBeNull();

            // …and the thread unmounting drops it.
            renderHook(() => useMessageJump({ ...params, threadRootNo: '3' })).unmount();
            expect(useMessageJumpStore.getState().target).toBeNull();
        });

        it('is left alone by another thread of the same channel', () => {
            const containerRef = setup(5);
            useMessageJumpStore.getState().request('ch-1', 5, { threadRootNo: '3' });

            renderHook(() =>
                useMessageJump({
                    channelId: 'ch-1',
                    containerRef,
                    messages,
                    hasMore: true,
                    isLoadingMore: false,
                    loadMore,
                    loadUntil,
                    threadRootNo: '4',
                })
            );

            expect(containerRef.current.firstElementChild?.scrollIntoView).not.toHaveBeenCalled();
            expect(useMessageJumpStore.getState().target).not.toBeNull();
        });
    });
});
