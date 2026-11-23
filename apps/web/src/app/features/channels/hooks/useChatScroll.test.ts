import { createRef } from 'react';
import { act, renderHook } from '@testing-library/react';

import { useChatScroll } from './useChatScroll';
import { stashScroll } from '../../../hooks/useScrollRestoration';
import type { ClientChatView } from '../types';

let frames: FrameRequestCallback[] = [];
const flushFrames = () => {
    const queued = frames;
    frames = [];
    queued.forEach(cb => cb(0));
};

const message = (id: string): ClientChatView => ({ id }) as ClientChatView;

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

    describe('the resize and focus pin', () => {
        const fire = (suppressAutoScroll: boolean, holdBottomPin = false) => {
            jest.useFakeTimers({ doNotFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
            const textarea = document.createElement('textarea');
            const inputRef = { current: textarea };
            const view = renderHook((props: Parameters<typeof useChatScroll>[0]) => useChatScroll(props), {
                initialProps: {
                    messages: [message('m1')],
                    hasMore: true,
                    isLoadingMore: false,
                    loadMore: jest.fn(),
                    inputRef,
                    suppressAutoScroll,
                    holdBottomPin,
                },
            });
            const container = document.createElement('div');
            container.scrollTo = jest.fn();
            (view.result.current.containerRef as React.MutableRefObject<HTMLDivElement | null>).current = container;
            act(() => flushFrames());
            (container.scrollTo as jest.Mock).mockClear();

            textarea.dispatchEvent(new Event('focus'));
            act(() => {
                jest.advanceTimersByTime(150);
            });
            act(() => flushFrames());
            return container;
        };

        it('pins to the bottom when the field takes focus', () => {
            expect(fire(false).scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
        });

        it('leaves the view alone when the field takes focus while another owner holds it', () => {
            expect(fire(true).scrollTo).not.toHaveBeenCalled();
        });

        it('leaves the view alone when the field takes focus while the pin is held for an edit', () => {
            expect(fire(false, true).scrollTo).not.toHaveBeenCalled();
        });
    });

    describe('the edit hold (holdBottomPin)', () => {
        const props = (overrides: Record<string, unknown>) => ({
            messages: [message('m1')],
            hasMore: true,
            isLoadingMore: false,
            loadMore: jest.fn(),
            inputRef: createRef<HTMLTextAreaElement>(),
            suppressAutoScroll: false,
            holdBottomPin: true,
            composerHeight: 50,
            ...overrides,
        });
        const mount = () => {
            const view = renderHook(p => useChatScroll(p), { initialProps: props({}) });
            const container = document.createElement('div');
            container.scrollTo = jest.fn();
            (view.result.current.containerRef as React.MutableRefObject<HTMLDivElement | null>).current = container;
            act(() => flushFrames());
            (container.scrollTo as jest.Mock).mockClear();
            return { view, container };
        };

        it('does not re-pin when the composer grows', () => {
            const { view, container } = mount();

            view.rerender(props({ composerHeight: 120 }));
            act(() => flushFrames());

            expect(container.scrollTo).not.toHaveBeenCalled();
        });

        it('still follows a new latest message for a reader at the bottom', () => {
            const { view, container } = mount();

            view.rerender(props({ messages: [message('m1'), message('m2')] }));
            act(() => flushFrames());

            expect(container.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
        });
    });

    it('does not retroactively scroll for messages that landed while suppressed', () => {
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
    const readingHistory = (onReadingRow?: (chatNo: number) => void) => {
        const inputRef = createRef<HTMLTextAreaElement>();
        const loadMore = jest.fn();
        const readingHistoryRef = { current: false };
        const props = { hasMore: false, isLoadingMore: false, loadMore, inputRef, readingHistoryRef, onReadingRow };
        const view = renderHook(p => useChatScroll(p), { initialProps: { ...props, messages: [message('m1')] } });
        const container = document.createElement('div');
        container.scrollTo = jest.fn();
        sizeContainer(container, { scrollHeight: 4000, clientHeight: 500 });
        (view.result.current.containerRef as React.MutableRefObject<HTMLDivElement | null>).current = container;
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
        const show = (next: ClientChatView[]) => {
            shown = next;
            view.rerender({ ...props, messages: shown });
            act(() => flushFrames());
        };
        return { container, scrollTo, arrive, show, readingHistoryRef };
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

        now.mockReturnValue(50);
        arrive(message('m2'));

        expect(container.scrollTop).toBe(-800);
    });

    it('anchors on a row, not on the date group a hit in the gap between rows lands in', () => {
        const { container, scrollTo, arrive } = readingHistory();
        jest.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(1000);
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

        container.scrollTop = -872;
        arrive(message('m2'));

        expect(container.scrollTop).toBe(-872);
    });

    it('does not take its own correction for the reader scrolling', () => {
        const { container, scrollTo, arrive } = readingHistory();
        const now = jest.spyOn(performance, 'now').mockReturnValue(0);
        anchorIn(container, [300, 228, 300, 300, 228]);
        scrollTo(-800);
        now.mockReturnValue(1000);
        arrive(message('m2'));
        expect(container.scrollTop).toBe(-872);

        now.mockReturnValue(1050);
        scrollTo(container.scrollTop);
        arrive(message('m3'));

        expect(container.scrollTop).toBe(-944);
    });

    it('keeps the reader on their row when rows land below them in the middle of the list (a gap filled)', () => {
        const { container, scrollTo, show } = readingHistory();
        const now = jest.spyOn(performance, 'now').mockReturnValue(0);
        anchorIn(container, [300, 228]);
        scrollTo(-800);

        now.mockReturnValue(1000);
        show([message('m0'), message('m1')]);

        expect(container.scrollTop).toBe(-872);
        expect(container.scrollTo).not.toHaveBeenCalled();
    });

    it('leaves a reader at the bottom alone when the list changes above them', () => {
        const { container, scrollTo, show } = readingHistory();
        jest.spyOn(performance, 'now').mockReturnValue(1000);
        anchorIn(container, [300, 228]);
        scrollTo(-20);

        show([message('m0'), message('m1')]);

        expect(container.scrollTop).toBe(-20);
    });

    it('reports the row being read while away from the bottom, and not at it', () => {
        const onReadingRow = jest.fn();
        const { container, scrollTo } = readingHistory(onReadingRow);
        anchorIn(container, [300]);

        scrollTo(-20);
        expect(onReadingRow).not.toHaveBeenCalled();

        scrollTo(-800);
        expect(onReadingRow).toHaveBeenCalledWith(42);
    });

    it('tells the window whether the reader is reading history', () => {
        const { scrollTo, readingHistoryRef } = readingHistory();

        scrollTo(-800);
        expect(readingHistoryRef.current).toBe(true);

        scrollTo(-20);
        expect(readingHistoryRef.current).toBe(false);
    });
});

describe('useChatScroll — 방 재진입 스크롤 복원', () => {
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

    it('언마운트가 위치를 맡아두어 다음 진입이 그 자리로 돌아온다', () => {
        const first = mount('ch-unmount');
        first.land([message('m1')]);
        first.container.scrollTop = -820;
        act(() => first.view.result.current.handleScroll());

        first.view.unmount();

        const second = mount('ch-unmount');
        second.land([message('m1')]);

        expect(second.container.scrollTop).toBe(-820);
        expect(second.container.scrollTo).not.toHaveBeenCalled();
    });

    it('복원 전에 언마운트돼도 맡긴 위치를 잃지 않는다', () => {
        stashScroll('ch-strict', -300);

        const first = mount('ch-strict');
        first.view.unmount();

        const second = mount('ch-strict');
        second.land([message('m1')]);

        expect(second.container.scrollTop).toBe(-300);
    });

    it('바닥에서 나가면 다음 진입도 바닥이다', () => {
        const first = mount('ch-bottom');
        first.land([message('m1')]);
        first.view.unmount();

        const second = mount('ch-bottom');
        second.land([message('m1')]);

        expect(second.container.scrollTop).toBe(0);
    });
});
