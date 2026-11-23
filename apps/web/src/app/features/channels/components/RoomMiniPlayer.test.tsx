import '@testing-library/jest-dom';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { useMessageJumpStore } from '../../../stores/useMessageJumpStore';
import { resetRoomAudioStore, useRoomAudioStore, type AudioStatus, type AudioTrack } from '../stores/roomAudioStore';
import { RoomMiniPlayer } from './RoomMiniPlayer';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));
const mockNavigate = jest.fn();
jest.mock('@chatic/shared', () => ({
    ...jest.requireActual('@chatic/shared'),
    useNavigateWithTransition: () => mockNavigate,
}));

class FakeIntersectionObserver {
    static instances: FakeIntersectionObserver[] = [];
    observed: Element[] = [];
    disconnected = false;

    constructor(private readonly callback: IntersectionObserverCallback) {
        FakeIntersectionObserver.instances.push(this);
    }

    observe(target: Element) {
        this.observed.push(target);
    }

    disconnect() {
        this.disconnected = true;
    }

    fire(isIntersecting: boolean) {
        const entries = this.observed.map(target => ({ target, isIntersecting }) as IntersectionObserverEntry);
        act(() => this.callback(entries, this as unknown as IntersectionObserver));
    }
}

const live = () => FakeIntersectionObserver.instances.filter(observer => !observer.disconnected);

const track = (over: Partial<AudioTrack> = {}): AudioTrack => ({
    key: 'c1/up-7',
    cid: 'c1',
    channelId: 'ch-1',
    chatId: 'ch-1:7',
    chatNo: 7,
    idx: 0,
    url: 'https://cdn/7.m4a',
    name: 'memo.m4a',
    senderName: 'Kim',
    ...over,
});

const load = (playing: AudioTrack = track(), status: AudioStatus = 'playing', position = 5) =>
    act(() => useRoomAudioStore.setState({ current: playing, status, position, duration: 30 }));

const list = (withBubble: boolean) => {
    const root = document.createElement('div');
    if (withBubble) {
        const bubble = document.createElement('div');
        bubble.setAttribute('data-audio-key', 'c1/up-7');
        root.appendChild(bubble);
    }
    document.body.appendChild(root);
    return root;
};

const renderPlayer = (root: HTMLElement, props: { threadRootNo?: string; rowsVersion?: unknown } = {}) => {
    const containerRef = { current: root };
    const view = render(
        <RoomMiniPlayer
            channelId="ch-1"
            containerRef={containerRef}
            rowsVersion={props.rowsVersion ?? 1}
            top={56}
            {...(props.threadRootNo ? { threadRootNo: props.threadRootNo } : {})}
        />
    );
    return {
        ...view,
        rerenderWith: (next: { rowsVersion: unknown }) =>
            view.rerender(
                <RoomMiniPlayer
                    channelId="ch-1"
                    containerRef={containerRef}
                    rowsVersion={next.rowsVersion}
                    top={56}
                    {...(props.threadRootNo ? { threadRootNo: props.threadRootNo } : {})}
                />
            ),
    };
};

const closeButton = () => screen.queryByRole('button', { name: 'chat.attach.audio.closePlayer' });

describe('RoomMiniPlayer', () => {
    const original = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;

    beforeEach(() => {
        resetRoomAudioStore();
        useMessageJumpStore.getState().clear();
        mockNavigate.mockReset();
        FakeIntersectionObserver.instances = [];
        (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeIntersectionObserver;
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    afterAll(() => {
        (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = original;
    });

    it('shows nothing while nothing is loaded', () => {
        renderPlayer(list(false));

        expect(closeButton()).not.toBeInTheDocument();
    });

    it('shows while playing when the bubble is not drawn on this surface', () => {
        load();
        renderPlayer(list(false));

        expect(closeButton()).toBeInTheDocument();
        expect(screen.getByText('memo.m4a')).toBeInTheDocument();
    });

    it('shows a file paused mid-way, but not one paused at its start', () => {
        load(track(), 'paused', 12);
        const { unmount } = renderPlayer(list(false));
        expect(closeButton()).toBeInTheDocument();
        unmount();

        load(track(), 'paused', 0);
        renderPlayer(list(false));
        expect(closeButton()).not.toBeInTheDocument();
    });

    it('shows nothing for another channel’s file', () => {
        load(track({ channelId: 'ch-2' }));
        renderPlayer(list(false));

        expect(closeButton()).not.toBeInTheDocument();
    });

    it('hides while the bubble is on screen and shows once it scrolls away', () => {
        load();
        const root = list(true);
        renderPlayer(root);

        const [observer] = live();
        expect(observer?.observed).toEqual([root.querySelector('[data-audio-key]')]);

        observer?.fire(true);
        expect(closeButton()).not.toBeInTheDocument();

        observer?.fire(false);
        expect(closeButton()).toBeInTheDocument();
    });

    it('finds a bubble drawn after it mounted once the rows change', () => {
        load();
        const root = list(false);
        const { rerenderWith } = renderPlayer(root, { rowsVersion: 1 });
        expect(live()).toHaveLength(0);
        expect(closeButton()).toBeInTheDocument();

        const bubble = document.createElement('div');
        bubble.setAttribute('data-audio-key', 'c1/up-7');
        root.appendChild(bubble);
        rerenderWith({ rowsVersion: 2 });
        live()[0]?.fire(true);

        expect(closeButton()).not.toBeInTheDocument();
    });

    it('names a voice message as one rather than by its file name', () => {
        load(track({ name: 'voice-20261102-101500.m4a' }));
        renderPlayer(list(false));

        expect(screen.getByText('chat.attach.audio.voiceMessage')).toBeInTheDocument();
        expect(screen.queryByText('voice-20261102-101500.m4a')).not.toBeInTheDocument();
    });

    it('stops and unloads on ×', () => {
        load();
        renderPlayer(list(false));

        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.audio.closePlayer' }));

        expect(useRoomAudioStore.getState().current).toBeNull();
        expect(useRoomAudioStore.getState().status).toBe('idle');
        expect(closeButton()).not.toBeInTheDocument();
    });

    it('jumps back to the bubble in the room on a press of its body', () => {
        load();
        renderPlayer(list(false));

        fireEvent.click(screen.getByText('memo.m4a'));

        expect(useMessageJumpStore.getState().target).toMatchObject({ channelId: 'ch-1', chatNo: 7 });
        expect(useMessageJumpStore.getState().target?.threadRootNo).toBeUndefined();
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('opens the thread first for a reply’s file played from the room', () => {
        load(track({ threadRootNo: '3' }));
        renderPlayer(list(false));
        let jumpAtNavigate: unknown = 'not navigated';
        mockNavigate.mockImplementation(() => {
            jumpAtNavigate = useMessageJumpStore.getState().target;
        });

        fireEvent.click(screen.getByText('memo.m4a'));

        expect(mockNavigate).toHaveBeenCalledWith('/channels/ch-1/thread/3');
        expect(jumpAtNavigate).toBeNull();
        expect(useMessageJumpStore.getState().target).toMatchObject({
            channelId: 'ch-1',
            chatNo: 7,
            threadRootNo: '3',
        });
    });

    it('does not navigate for a reply’s file when its thread is already open', () => {
        load(track({ threadRootNo: '3' }));
        renderPlayer(list(false), { threadRootNo: '3' });

        fireEvent.click(screen.getByText('memo.m4a'));

        expect(mockNavigate).not.toHaveBeenCalled();
        expect(useMessageJumpStore.getState().target).toMatchObject({ chatNo: 7, threadRootNo: '3' });
    });
});
