import { act, renderHook } from '@testing-library/react';

import { useMessageJumpStore } from '../../../stores/useMessageJumpStore';
import { useMessageJump } from './useMessageJump';
import type { ClientChatView } from '../types';

const toast = jest.fn();
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: (...args: unknown[]) => toast(...args) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }) }));

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
});
