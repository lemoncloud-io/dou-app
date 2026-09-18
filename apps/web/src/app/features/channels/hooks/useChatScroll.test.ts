import { createRef } from 'react';
import { act, renderHook } from '@testing-library/react';

import { useChatScroll } from './useChatScroll';
import { stashScroll } from '../../../hooks/useScrollRestoration';
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
        act(() => view.result.current.handleScroll());
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

// Leaving the room unmounts this page, and the reversed list starts back at scrollTop 0 (=
// bottom) on remount. Whether someone reading history opened a thread or went back home, they
// must not be dropped onto the latest message.
describe('useChatScroll — 방 재진입 스크롤 복원', () => {
    // The container must be attached from mount time so the restore layout effect can observe
    // it (the `setup` above attaches it after renderHook, so a self-contained install is used here).
    const mount = (channelId?: string) => {
        const inputRef = createRef<HTMLTextAreaElement>();
        const container = document.createElement('div');
        container.scrollTo = jest.fn();
        Object.defineProperty(container, 'scrollHeight', { value: 2000, configurable: true });
        Object.defineProperty(container, 'clientHeight', { value: 500, configurable: true });

        const props = {
            messages: [] as ClientChatView[],
            hasMore: true,
            isLoadingMore: false,
            loadMore: jest.fn(),
            inputRef,
            channelId,
        };
        const view = renderHook(p => useChatScroll(p), { initialProps: props });
        (view.result.current.containerRef as React.MutableRefObject<HTMLDivElement | null>).current = container;

        const land = (messages: ClientChatView[]) => {
            view.rerender({ ...props, messages });
            flushFrames();
        };
        return { view, container, land };
    };

    // Each test uses a different channel id: the stashed position lives in a module-level map
    // that unmount repopulates (RTL's auto cleanup included), so reusing the same id would leak
    // an earlier test into a later one.
    it('맡긴 위치로 되돌리고, 바닥 고정이 그것을 덮어쓰지 않는다', () => {
        stashScroll('ch-restore', -640);
        const { container, land } = mount('ch-restore');

        land([message('m1')]);

        expect(container.scrollTop).toBe(-640);
        expect(container.scrollTo).not.toHaveBeenCalled();
    });

    it('맡긴 위치가 없으면 평소대로 바닥으로 내린다', () => {
        const { container, land } = mount('ch-fresh');

        land([message('m1')]);

        expect(container.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
    });

    // Restores only once — a new message arriving after the restore must follow back down to the bottom.
    it('복원은 한 번뿐이고 이후 새 메시지는 다시 바닥으로 따라간다', () => {
        stashScroll('ch-once', -640);
        const { container, land } = mount('ch-once');

        land([message('m1')]);
        expect(container.scrollTop).toBe(-640);

        land([message('m1'), message('m2')]);
        expect(container.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
    });

    it('다른 채널이 맡긴 위치는 쓰지 않는다', () => {
        stashScroll('ch-other', -640);
        const { container, land } = mount('ch-mine');

        land([message('m1')]);

        expect(container.scrollTop).toBe(0);
        expect(container.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
    });

    // Whatever the exit path is (including navigating back home), unmount stashes the position —
    // so no caller ever needs to save it directly.
    it('언마운트가 위치를 맡아두어 다음 진입이 그 자리로 돌아온다', () => {
        const first = mount('ch-unmount');
        first.land([message('m1')]);
        // Just as the real list does: a scroll event records the position. By unmount time,
        // React has already detached the host ref, so it can't be read directly from the container.
        first.container.scrollTop = -820;
        act(() => first.view.result.current.handleScroll());

        first.view.unmount();

        const second = mount('ch-unmount');
        second.land([message('m1')]);

        expect(second.container.scrollTop).toBe(-820);
        expect(second.container.scrollTo).not.toHaveBeenCalled();
    });

    // The list is still empty right after mount. If unmount happens in that window (StrictMode's
    // mount/unmount/mount cuts in exactly here), the stashed position that hasn't been written
    // yet must not be overwritten with the bottom (0).
    it('복원 전에 언마운트돼도 맡긴 위치를 잃지 않는다', () => {
        stashScroll('ch-strict', -300);

        const first = mount('ch-strict');
        first.view.unmount();

        const second = mount('ch-strict');
        second.land([message('m1')]);

        expect(second.container.scrollTop).toBe(-300);
    });

    // Left from the bottom, so open at the bottom — a room that was never scrolled must not suddenly open differently.
    it('바닥에서 나가면 다음 진입도 바닥이다', () => {
        const first = mount('ch-bottom');
        first.land([message('m1')]);
        first.view.unmount();

        const second = mount('ch-bottom');
        second.land([message('m1')]);

        // Reached not via the bottom-pin (scrollTo) but via the restore writing 0 as-is — in a
        // reversed list, 0 is the bottom, so the resulting position is the same either way.
        expect(second.container.scrollTop).toBe(0);
    });
});
