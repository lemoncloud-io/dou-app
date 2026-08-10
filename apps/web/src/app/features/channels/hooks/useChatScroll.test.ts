import { createRef } from 'react';
import { act, renderHook } from '@testing-library/react';

import { useChatScroll } from './useChatScroll';
import { stashRoomScroll } from '../utils/roomScrollMemory';
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

// 방을 나가면 이 페이지는 언마운트되고, 역방향 목록은 다시 scrollTop 0(=바닥)에서 시작한다.
// 히스토리를 읽던 사람이 스레드를 열었든 홈으로 나갔든 최신 메시지에 떨궈지지 않아야 한다.
describe('useChatScroll — 방 재진입 스크롤 복원', () => {
    // 컨테이너를 마운트 시점부터 붙여야 복원 레이아웃 이펙트가 관측할 수 있다(위 setup은
    // renderHook 뒤에 붙이므로 여기서는 자체 설치를 쓴다).
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

    // 채널 id를 테스트마다 다르게 쓴다: 맡아둔 위치는 모듈 수준 맵이고 언마운트가 그것을 다시
    // 채우므로(RTL의 자동 cleanup 포함), 같은 id를 재사용하면 앞 테스트가 뒤 테스트에 샌다.
    it('맡긴 위치로 되돌리고, 바닥 고정이 그것을 덮어쓰지 않는다', () => {
        stashRoomScroll('ch-restore', -640);
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

    // 한 번만 복원한다 — 복원 뒤 도착하는 새 메시지는 다시 바닥으로 따라가야 한다.
    it('복원은 한 번뿐이고 이후 새 메시지는 다시 바닥으로 따라간다', () => {
        stashRoomScroll('ch-once', -640);
        const { container, land } = mount('ch-once');

        land([message('m1')]);
        expect(container.scrollTop).toBe(-640);

        land([message('m1'), message('m2')]);
        expect(container.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
    });

    it('다른 채널이 맡긴 위치는 쓰지 않는다', () => {
        stashRoomScroll('ch-other', -640);
        const { container, land } = mount('ch-mine');

        land([message('m1')]);

        expect(container.scrollTop).toBe(0);
        expect(container.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
    });

    // 나가는 경로가 무엇이든(홈으로 뒤로가기 포함) 언마운트가 위치를 맡아둔다 — 그래서 어떤
    // 호출자도 직접 저장할 필요가 없다.
    it('언마운트가 위치를 맡아두어 다음 진입이 그 자리로 돌아온다', () => {
        const first = mount('ch-unmount');
        first.land([message('m1')]);
        // 실제 목록이 하는 그대로: 스크롤 이벤트가 위치를 기록한다. 언마운트 시점에는 React가
        // host ref를 이미 떼어낸 뒤라 컨테이너에서 직접 읽을 수 없다.
        first.container.scrollTop = -820;
        act(() => first.view.result.current.handleScroll());

        first.view.unmount();

        const second = mount('ch-unmount');
        second.land([message('m1')]);

        expect(second.container.scrollTop).toBe(-820);
        expect(second.container.scrollTo).not.toHaveBeenCalled();
    });

    // 목록은 마운트 직후엔 아직 비어 있다. 그 사이에 언마운트되면(StrictMode의 마운트/언마운트/
    // 마운트가 정확히 여기서 끊는다) 아직 쓰지 못한 맡긴 위치를 바닥(0)으로 덮어써서는 안 된다.
    it('복원 전에 언마운트돼도 맡긴 위치를 잃지 않는다', () => {
        stashRoomScroll('ch-strict', -300);

        const first = mount('ch-strict');
        first.view.unmount();

        const second = mount('ch-strict');
        second.land([message('m1')]);

        expect(second.container.scrollTop).toBe(-300);
    });

    // 바닥에서 나갔으면 바닥으로 — 스크롤한 적 없는 방이 갑자기 다르게 열리지 않아야 한다.
    it('바닥에서 나가면 다음 진입도 바닥이다', () => {
        const first = mount('ch-bottom');
        first.land([message('m1')]);
        first.view.unmount();

        const second = mount('ch-bottom');
        second.land([message('m1')]);

        // 바닥 고정(scrollTo)이 아니라 복원이 0을 그대로 적어서 도달한다 — 역방향 목록에서 0은
        // 곧 바닥이므로 결과 위치는 같다.
        expect(second.container.scrollTop).toBe(0);
    });
});
