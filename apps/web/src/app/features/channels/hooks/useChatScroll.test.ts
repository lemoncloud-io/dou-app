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

// jsdom does no layout, so a container's sizes are whatever a test says they are.
const sizeContainer = (container: HTMLElement, sizes: { scrollHeight: number; clientHeight: number }) => {
    Object.defineProperty(container, 'scrollHeight', { value: sizes.scrollHeight, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: sizes.clientHeight, configurable: true });
};

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

    it('leaves the offset alone when an older page lands', () => {
        const { view, container, loadMore, inputRef } = setup([message('m2')], true);
        sizeContainer(container, { scrollHeight: 5000, clientHeight: 500 });
        container.scrollTop = -3600;
        act(() => view.result.current.handleScroll());
        expect(loadMore).toHaveBeenCalled();

        // The reader keeps scrolling while the page is in flight. Rows added at the top of a reversed
        // list leave the view where it is in both engines, so the page must not put the reader back
        // where they were when it was asked for.
        container.scrollTop = -4200;
        view.rerender({
            messages: [message('m1'), message('m2')],
            hasMore: true,
            isLoadingMore: false,
            loadMore,
            inputRef,
            suppressAutoScroll: true,
        });

        expect(container.scrollTop).toBe(-4200);
    });
});

describe('useChatScroll — asking for older pages', () => {
    const props = (overrides: Partial<Parameters<typeof useChatScroll>[0]> = {}) => ({
        messages: [message('m2')],
        hasMore: true,
        isLoadingMore: false,
        loadMore: jest.fn(),
        inputRef: createRef<HTMLTextAreaElement>(),
        ...overrides,
    });

    const mountAt = (sizes: { scrollHeight: number; clientHeight: number; scrollTop: number }, initial = props()) => {
        const view = renderHook(p => useChatScroll(p), { initialProps: initial });
        const container = document.createElement('div');
        container.scrollTo = jest.fn();
        sizeContainer(container, sizes);
        container.scrollTop = sizes.scrollTop;
        (view.result.current.containerRef as React.MutableRefObject<HTMLDivElement | null>).current = container;
        return { view, container };
    };

    it('asks while two viewports of history are still above, without waiting for the scroll to stop', () => {
        const initial = props();
        // 5000 − 500 − 3600 = 900px left above: less than two 500px viewports.
        const { view } = mountAt({ scrollHeight: 5000, clientHeight: 500, scrollTop: -3600 }, initial);

        act(() => view.result.current.handleScroll());

        expect(initial.loadMore).toHaveBeenCalledTimes(1);
    });

    it('does not ask while more than two viewports are left', () => {
        const initial = props();
        const { view } = mountAt({ scrollHeight: 5000, clientHeight: 500, scrollTop: -3000 }, initial);

        act(() => view.result.current.handleScroll());

        expect(initial.loadMore).not.toHaveBeenCalled();
    });

    it('asks again when a page lands and the reader is still within reach of the top', () => {
        const initial = props();
        const { view } = mountAt({ scrollHeight: 5000, clientHeight: 500, scrollTop: -3600 }, initial);

        // No scroll event: the commit that brought the page in is what checks again.
        view.rerender({ ...initial, messages: [message('m1'), message('m2')] });

        expect(initial.loadMore).toHaveBeenCalledTimes(1);
    });

    it('fills a thread too short to scroll', () => {
        const initial = props();
        const { view } = mountAt({ scrollHeight: 500, clientHeight: 500, scrollTop: 0 }, initial);

        view.rerender({ ...initial, messages: [message('m1'), message('m2')] });

        expect(initial.loadMore).toHaveBeenCalled();
    });

    it('does not ask while a page is in flight or when there is nothing older', () => {
        const busy = props({ isLoadingMore: true });
        const first = mountAt({ scrollHeight: 5000, clientHeight: 500, scrollTop: -4500 }, busy);
        act(() => first.view.result.current.handleScroll());

        const done = props({ hasMore: false });
        const second = mountAt({ scrollHeight: 5000, clientHeight: 500, scrollTop: -4500 }, done);
        act(() => second.view.result.current.handleScroll());

        expect(busy.loadMore).not.toHaveBeenCalled();
        expect(done.loadMore).not.toHaveBeenCalled();
    });
});

describe('useChatScroll — a new message while reading history', () => {
    // Someone reading history; messages land below them, one `arrive` at a time.
    const readingHistory = () => {
        const inputRef = createRef<HTMLTextAreaElement>();
        const loadMore = jest.fn();
        const readingHistoryRef = { current: false };
        const props = { hasMore: false, isLoadingMore: false, loadMore, inputRef, readingHistoryRef };
        const view = renderHook(p => useChatScroll(p), { initialProps: { ...props, messages: [message('m1')] } });
        const container = document.createElement('div');
        container.scrollTo = jest.fn();
        sizeContainer(container, { scrollHeight: 4000, clientHeight: 500 });
        (view.result.current.containerRef as React.MutableRefObject<HTMLDivElement | null>).current = container;
        // The first page pinned to the bottom; start counting from here.
        act(() => flushFrames());
        (container.scrollTo as jest.Mock).mockClear();

        let shown = [message('m1')];
        const scrollTo = (top: number) => {
            container.scrollTop = top;
            act(() => view.result.current.handleScroll());
        };
        const arrive = (next: ClientChatView) => {
            shown = [...shown, next];
            view.rerender({ ...props, messages: shown });
            act(() => flushFrames());
        };
        return { container, scrollTo, arrive, readingHistoryRef };
    };

    afterEach(() => {
        delete (document as { elementFromPoint?: unknown }).elementFromPoint;
    });

    it("stays where the reader is for someone else's message", () => {
        const { container, scrollTo, arrive } = readingHistory();
        scrollTo(-800);

        arrive(message('m2'));

        expect(container.scrollTo).not.toHaveBeenCalled();
    });

    it('still follows a message the reader sent themselves', () => {
        const { container, scrollTo, arrive } = readingHistory();
        scrollTo(-800);

        arrive({ id: 'mine', isOwner: true, isPending: true } as ClientChatView);

        expect(container.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
    });

    it('follows within the bottom slack, as before', () => {
        const { container, scrollTo, arrive } = readingHistory();
        scrollTo(-30);

        arrive(message('m2'));

        expect(container.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
    });

    // jsdom has no layout, so the row the reader looks at is stood in for: `elementFromPoint` hands
    // back one row inside the list, and its rect answers where it sits — each reading in turn.
    const anchorIn = (container: HTMLElement, tops: number[]) => {
        const row = document.createElement('div');
        row.setAttribute('data-chat-no', '42');
        container.appendChild(row);
        const rect = jest.spyOn(row, 'getBoundingClientRect');
        for (const top of tops) rect.mockReturnValueOnce({ top } as DOMRect);
        rect.mockReturnValue({ top: tops[tops.length - 1] } as DOMRect);
        (document as { elementFromPoint?: unknown }).elementFromPoint = jest.fn(() => row);
        return row;
    };

    it('takes back the shift a new row causes where the engine does not anchor (WebKit)', () => {
        const { container, scrollTo, arrive } = readingHistory();
        const now = jest.spyOn(performance, 'now').mockReturnValue(0);
        // Seen at 300 when the reader stopped; 72px higher once a 60px row and its gap land below.
        anchorIn(container, [300, 228]);
        scrollTo(-800);

        now.mockReturnValue(1000);
        arrive(message('m2'));

        expect(container.scrollTop).toBe(-872);
        expect(container.scrollTo).not.toHaveBeenCalled();
    });

    it('leaves the view alone where the engine already kept it (Blink)', () => {
        const { container, scrollTo, arrive } = readingHistory();
        const now = jest.spyOn(performance, 'now').mockReturnValue(0);
        anchorIn(container, [300, 300]);
        scrollTo(-800);

        now.mockReturnValue(1000);
        arrive(message('m2'));

        expect(container.scrollTop).toBe(-800);
    });

    it('does not correct while the reader is still moving the list', () => {
        const { container, scrollTo, arrive } = readingHistory();
        const now = jest.spyOn(performance, 'now').mockReturnValue(0);
        anchorIn(container, [300, 228]);
        scrollTo(-800);

        // 50ms after the last scroll event: mid-fling, where assigning scrollTop would stop it dead.
        now.mockReturnValue(50);
        arrive(message('m2'));

        expect(container.scrollTop).toBe(-800);
    });

    it('anchors on a row, not on the date group a hit in the gap between rows lands in', () => {
        const { container, scrollTo, arrive } = readingHistory();
        jest.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(1000);
        // The group's top stays put — a row arrived at its bottom while another left its top — so
        // measured on the group, the shift would read 0 while the reader's rows moved up by 72px.
        const group = document.createElement('div');
        group.setAttribute('data-date-label', '10. 02');
        jest.spyOn(group, 'getBoundingClientRect').mockReturnValue({ top: 120 } as DOMRect);
        const row = document.createElement('div');
        row.setAttribute('data-chat-no', '42');
        jest.spyOn(row, 'getBoundingClientRect')
            .mockReturnValueOnce({ top: 300 } as DOMRect)
            .mockReturnValue({
                top: 228,
            } as DOMRect);
        group.appendChild(row);
        container.appendChild(group);
        // The centre lands in the gap; 16px lower is the row.
        (document as { elementFromPoint?: unknown }).elementFromPoint = jest.fn((_x: number, y: number) =>
            y === 0 ? group : row
        );
        scrollTo(-800);

        arrive(message('m2'));

        expect(container.scrollTop).toBe(-872);
    });

    it('does not correct a second time where the engine already moved the offset', () => {
        const { container, scrollTo, arrive } = readingHistory();
        jest.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(1000);
        anchorIn(container, [300, 228]);
        scrollTo(-800);

        // Blink's scroll anchoring has already moved the offset by the new row's height by the time
        // the commit is looked at; a correction on top would move the reader again.
        container.scrollTop = -872;
        arrive(message('m2'));

        expect(container.scrollTop).toBe(-872);
    });

    it('does not take its own correction for the reader scrolling', () => {
        const { container, scrollTo, arrive } = readingHistory();
        const now = jest.spyOn(performance, 'now').mockReturnValue(0);
        // Read at 300; 72px higher after the first arrival; back at 300 once corrected; 72px higher
        // again after the second arrival.
        anchorIn(container, [300, 228, 300, 300, 228]);
        scrollTo(-800);
        now.mockReturnValue(1000);
        arrive(message('m2'));
        expect(container.scrollTop).toBe(-872);

        // The correction's own scroll event, 50ms before the next message, at the offset the hook
        // itself assigned. Stamped as the reader moving the list, it would make that message look
        // mid-fling and leave it uncorrected.
        now.mockReturnValue(1050);
        scrollTo(container.scrollTop);
        arrive(message('m3'));

        expect(container.scrollTop).toBe(-944);
    });

    it('tells the window whether the reader is reading history', () => {
        const { scrollTo, readingHistoryRef } = readingHistory();

        scrollTo(-800);
        expect(readingHistoryRef.current).toBe(true);

        scrollTo(-20);
        expect(readingHistoryRef.current).toBe(false);
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

    // Restores only once. Afterwards the restored place is an ordinary place in history: someone
    // else's message leaves it alone, and the reader's own send follows down as it would anywhere.
    it('restores only once, after which a new message is handled like anywhere else in history', () => {
        stashScroll('ch-once', -640);
        const { container, land } = mount('ch-once');

        land([message('m1')]);
        expect(container.scrollTop).toBe(-640);

        land([message('m1'), message('m2')]);
        expect(container.scrollTo).not.toHaveBeenCalled();

        land([message('m1'), message('m2'), { id: 'mine', isOwner: true } as ClientChatView]);
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
