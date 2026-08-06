import { createRef } from 'react';
import { act, renderHook } from '@testing-library/react';

import { useChatScroll } from './useChatScroll';
import type { ClientChatView } from '../types';

/**
 * `scrollToBottom` defers the real scroll to a `requestAnimationFrame`, so every assertion here
 * has to flush the queued frames. rAF is stubbed (jsdom has no frame loop) into a manual queue.
 */
let frames: FrameRequestCallback[] = [];
const flushFrames = () => {
    const queued = frames;
    frames = [];
    queued.forEach(cb => cb(0));
};

const message = (id: string): ClientChatView => ({ id }) as ClientChatView;

const setup = (messages: ClientChatView[], suppressAutoScroll = false) => {
    const inputRef = createRef<HTMLTextAreaElement>();
    const loadMore = jest.fn();
    const view = renderHook(props => useChatScroll(props), {
        initialProps: { messages, hasMore: true, isLoadingMore: false, loadMore, inputRef, suppressAutoScroll },
    });

    // Attach a real scroll container so scrollTo/scrollTop are observable.
    const container = document.createElement('div');
    container.scrollTo = jest.fn();
    (view.result.current.containerRef as React.MutableRefObject<HTMLDivElement | null>).current = container;

    return { view, container, loadMore, inputRef };
};

beforeEach(() => {
    frames = [];
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
        frames.push(cb);
        return frames.length;
    });
});

afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
});

describe('useChatScroll', () => {
    it('scrolls to the bottom when a new latest message arrives', () => {
        const { view, container } = setup([message('m1')]);

        view.rerender({
            messages: [message('m1'), message('m2')],
            hasMore: true,
            isLoadingMore: false,
            loadMore: jest.fn(),
            inputRef: createRef<HTMLTextAreaElement>(),
            suppressAutoScroll: false,
        });
        act(() => flushFrames());

        expect(container.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
    });

    it('does not scroll to the bottom while auto-scroll is suppressed', () => {
        const { view, container } = setup([message('m1')], true);

        view.rerender({
            messages: [message('m1'), message('m2')],
            hasMore: true,
            isLoadingMore: false,
            loadMore: jest.fn(),
            inputRef: createRef<HTMLTextAreaElement>(),
            suppressAutoScroll: true,
        });
        act(() => flushFrames());

        expect(container.scrollTo).not.toHaveBeenCalled();
    });

    it('does not retroactively scroll for messages that landed while suppressed', () => {
        // The jump case: messages arrive during the jump, then the jump finishes and clears the
        // store. Lifting suppression must not scroll for those already-counted messages.
        const { view, container } = setup([message('m1')], true);
        const rerenderWith = (messages: ClientChatView[], suppressAutoScroll: boolean) =>
            view.rerender({
                messages,
                hasMore: true,
                isLoadingMore: false,
                loadMore: jest.fn(),
                inputRef: createRef<HTMLTextAreaElement>(),
                suppressAutoScroll,
            });

        rerenderWith([message('m1'), message('m2')], true);
        act(() => flushFrames());
        expect(container.scrollTo).not.toHaveBeenCalled();

        rerenderWith([message('m1'), message('m2')], false);
        act(() => flushFrames());
        expect(container.scrollTo).not.toHaveBeenCalled();

        // A genuinely new message after suppression lifts still pins to the bottom.
        rerenderWith([message('m1'), message('m2'), message('m3')], false);
        act(() => flushFrames());
        expect(container.scrollTo).toHaveBeenCalledTimes(1);
    });

    it('preserves the anchor across an older-page load regardless of suppression', () => {
        // The loadMore trigger is debounced (100ms), so this case needs fake timers.
        jest.useFakeTimers();
        const { view, container, loadMore } = setup([message('m2')], true);
        container.scrollTop = -1400;
        Object.defineProperty(container, 'scrollHeight', { value: 2000, configurable: true });
        Object.defineProperty(container, 'clientHeight', { value: 500, configurable: true });

        // Near the top of the reversed list → loadMore + capture the anchor.
        act(() => view.result.current.debouncedHandleScroll());
        act(() => {
            jest.advanceTimersByTime(100);
        });
        expect(loadMore).toHaveBeenCalledTimes(1);

        // The older page renders at the top; the layout effect restores the captured scrollTop.
        container.scrollTop = 0;
        view.rerender({
            messages: [message('m1'), message('m2')],
            hasMore: true,
            isLoadingMore: false,
            loadMore,
            inputRef: createRef<HTMLTextAreaElement>(),
            suppressAutoScroll: true,
        });

        expect(container.scrollTop).toBe(-1400);
    });
});
