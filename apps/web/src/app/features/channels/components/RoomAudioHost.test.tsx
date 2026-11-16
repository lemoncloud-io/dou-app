import '@testing-library/jest-dom';

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate, type NavigateFunction } from 'react-router-dom';

import { resetRoomAudioStore, useRoomAudioStore, type AudioTrack } from '../stores/roomAudioStore';
import { channelOfPath, RoomAudioHost } from './RoomAudioHost';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));
const mockToast = jest.fn();
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: (arg: unknown) => mockToast(arg) }));
const mockGetChat = jest.fn();
const mockGetCloudRepositories = jest.fn((_cid: string) => ({ chat: { getChat: mockGetChat } }));
jest.mock('@chatic/app-runtime', () => ({
    runtime: { data: { getCloudRepositories: (cid: string) => mockGetCloudRepositories(cid) } },
}));

const track = (over: Partial<AudioTrack> = {}): AudioTrack => ({
    key: 'c1/up-7',
    cid: 'c1',
    channelId: 'ch-1',
    chatId: 'ch-1:7',
    chatNo: 7,
    idx: 0,
    uploadId: 'up-7',
    url: 'https://cdn/old.m4a',
    ...over,
});

/** Puts `playing` in the store as the loaded track, with where another file was left. */
const load = (playing: AudioTrack = track()) =>
    act(() =>
        useRoomAudioStore.setState({
            current: playing,
            status: 'playing',
            position: 4,
            positions: { 'c1/up-other': 9 },
        })
    );

// The router's navigate, captured so a test can move between screens with the host still mounted.
let navigate: NavigateFunction;
const CaptureNavigate = () => {
    navigate = useNavigate();
    return null;
};

const renderHost = (path = '/channels/ch-1/room') =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <RoomAudioHost />
            <CaptureNavigate />
        </MemoryRouter>
    );

const go = (path: string) => act(() => navigate(path));
const audioElement = () => screen.getByTestId('room-audio') as HTMLAudioElement;

/** jsdom implements no playback; `paused` is made writable so a test can say the element is playing. */
const setPaused = (element: HTMLMediaElement, paused: boolean) =>
    Object.defineProperty(element, 'paused', { configurable: true, get: () => paused });

describe('channelOfPath', () => {
    it.each([
        ['/channels/ch-1/room', 'ch-1'],
        ['/channels/ch-1/thread/3', 'ch-1'],
        ['/channels/ch-1/audio/7/0', 'ch-1'],
        ['/channels/ch-1/files', 'ch-1'],
        ['/channels/ch-1/settings', 'ch-1'],
        ['/channels/ch-1/invite', 'ch-1'],
    ])('reads the channel off %s', (path, channel) => {
        expect(channelOfPath(path)).toBe(channel);
    });

    it.each(['/home', '/channels', '/channels/ch-1', '/channels/ch-1/roomy', '/settings/channels/ch-1/room'])(
        'reads no channel off %s',
        path => {
            expect(channelOfPath(path)).toBeUndefined();
        }
    );
});

describe('RoomAudioHost', () => {
    let play: jest.SpyInstance;
    let pause: jest.SpyInstance;

    beforeEach(() => {
        resetRoomAudioStore();
        mockToast.mockReset();
        mockGetChat.mockReset();
        mockGetCloudRepositories.mockClear();
        // jsdom has no playback: the element's controls are stubbed so the store can drive it.
        play = jest.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
        pause = jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
        jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    });

    afterEach(() => {
        // Unmount while the stubs still stand: the host stops the element on its way out.
        cleanup();
        jest.restoreAllMocks();
    });

    it('draws one hidden audio element and hands it to the store', () => {
        renderHost();

        expect(document.querySelectorAll('audio')).toHaveLength(1);
        expect(audioElement()).toHaveClass('hidden');

        // The store plays through the attached element: a press loads the file into it.
        act(() => useRoomAudioStore.getState().play(track({ url: 'https://cdn/a.m4a' })));
        expect(audioElement().src).toBe('https://cdn/a.m4a');
        expect(play).toHaveBeenCalled();
    });

    describe('leaving the channel', () => {
        it('stops and forgets every position when another room opens', () => {
            renderHost();
            load();

            go('/channels/ch-2/room');

            const state = useRoomAudioStore.getState();
            expect(state.current).toBeNull();
            expect(state.status).toBe('idle');
            expect(state.positions).toEqual({});
        });

        it('stops when the channel screens are left altogether', () => {
            renderHost();
            load();

            go('/home');

            expect(useRoomAudioStore.getState().current).toBeNull();
        });

        it.each(['/channels/ch-1/audio/7/0', '/channels/ch-1/thread/3'])(
            'keeps playing on %s, a screen of the same channel',
            path => {
                renderHost();
                load();

                go(path);

                const state = useRoomAudioStore.getState();
                expect(state.current?.key).toBe('c1/up-7');
                expect(state.status).toBe('playing');
                expect(state.positions).toEqual({ 'c1/up-other': 9 });
            }
        );

        it('stops and forgets everything when the host unmounts', () => {
            const { unmount } = renderHost();
            load();

            unmount();

            const state = useRoomAudioStore.getState();
            expect(state.current).toBeNull();
            expect(state.positions).toEqual({});
        });
    });

    describe('one sound at a time', () => {
        it('pauses the room audio when another media element starts playing', () => {
            renderHost();
            const own = audioElement();
            setPaused(own, false);
            const video = document.createElement('video');
            document.body.appendChild(video);

            act(() => {
                video.dispatchEvent(new Event('play'));
            });

            expect(pause).toHaveBeenCalledTimes(1);
            expect(pause.mock.instances[0]).toBe(own);
            video.remove();
        });

        it('leaves an already paused room audio alone', () => {
            renderHost();
            setPaused(audioElement(), true);
            const other = document.createElement('audio');
            document.body.appendChild(other);

            act(() => {
                other.dispatchEvent(new Event('play'));
            });

            expect(pause).not.toHaveBeenCalled();
            other.remove();
        });

        it('pauses any other playing element when the room audio starts', () => {
            renderHost();
            const own = audioElement();
            const video = document.createElement('video');
            document.body.appendChild(video);
            setPaused(video, false);

            act(() => {
                own.dispatchEvent(new Event('play'));
            });

            expect(pause).toHaveBeenCalledTimes(1);
            expect(pause.mock.instances[0]).toBe(video);
            video.remove();
        });
    });

    describe('a file that fails to play', () => {
        const freshChat = (orgUrl: string | undefined) => ({
            id: 'ch-1:7',
            upload$$: [{ id: 'up-7', stereo: 'audio', status: 'ready', orgUrl }],
        });

        it('reads the message again once and plays on from the fresh address', async () => {
            mockGetChat.mockResolvedValue(freshChat('https://cdn/fresh.m4a'));
            renderHost();
            load();

            fireEvent.error(audioElement());

            await waitFor(() => expect(useRoomAudioStore.getState().current?.url).toBe('https://cdn/fresh.m4a'));
            expect(mockGetCloudRepositories).toHaveBeenCalledWith('c1');
            expect(mockGetChat).toHaveBeenCalledWith({ id: 'ch-1:7' });
            expect(audioElement().src).toBe('https://cdn/fresh.m4a');
            expect(useRoomAudioStore.getState().unplayable).toEqual({});
            expect(mockToast).not.toHaveBeenCalled();
        });

        it('marks the file unplayable and says so when the second try fails too', async () => {
            mockGetChat.mockResolvedValue(freshChat('https://cdn/fresh.m4a'));
            renderHost();
            load();

            fireEvent.error(audioElement());
            await waitFor(() => expect(useRoomAudioStore.getState().current?.url).toBe('https://cdn/fresh.m4a'));
            fireEvent.error(audioElement());

            await waitFor(() => expect(useRoomAudioStore.getState().unplayable).toEqual({ 'c1/up-7': true }));
            expect(mockGetChat).toHaveBeenCalledTimes(1);
            expect(useRoomAudioStore.getState().current).toBeNull();
            expect(mockToast).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'chat.attach.audio.playFailedToast', variant: 'destructive' })
            );
        });

        it.each([
            ['the same address', () => mockGetChat.mockResolvedValue(freshChat('https://cdn/old.m4a'))],
            ['no address', () => mockGetChat.mockResolvedValue(freshChat(undefined))],
            ['a failed read', () => mockGetChat.mockRejectedValue(new Error('offline'))],
        ])(
            'says it could not play, without marking the format, when reading the message again gives %s',
            async (_label, answer) => {
                answer();
                renderHost();
                load();

                fireEvent.error(audioElement());

                // Nothing says the format is at fault — the network or an unchanged address — so the file
                // stays playable for the next press, and the player stops waiting on it.
                await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));
                expect(mockToast).toHaveBeenCalledWith(
                    expect.objectContaining({ title: 'chat.attach.audio.playFailedToast' })
                );
                expect(useRoomAudioStore.getState().unplayable).toEqual({});
                expect(useRoomAudioStore.getState().status).toBe('paused');
            }
        );

        it('reads again for a later expiry of the same file: a new address is a new chance', async () => {
            mockGetChat
                .mockResolvedValueOnce(freshChat('https://cdn/second.m4a'))
                .mockResolvedValueOnce(freshChat('https://cdn/third.m4a'));
            renderHost();
            load();

            fireEvent.error(audioElement());
            await waitFor(() => expect(useRoomAudioStore.getState().current?.url).toBe('https://cdn/second.m4a'));
            // The fresh address itself fails at once: that is the format, not an expiry.
            fireEvent.error(audioElement());
            await waitFor(() => expect(useRoomAudioStore.getState().unplayable).toEqual({ 'c1/up-7': true }));
            expect(mockGetChat).toHaveBeenCalledTimes(1);
        });

        it('leaves alone a file the player moved on from while its message was read again', async () => {
            let answer: (value: unknown) => void = () => undefined;
            mockGetChat.mockReturnValue(new Promise(resolve => (answer = resolve)));
            renderHost();
            load();

            fireEvent.error(audioElement());
            act(() => useRoomAudioStore.getState().stop());
            await act(async () => answer(freshChat('https://cdn/fresh.m4a')));

            expect(mockToast).not.toHaveBeenCalled();
            expect(useRoomAudioStore.getState().unplayable).toEqual({});
        });

        it('ignores an error with nothing loaded', async () => {
            renderHost();

            fireEvent.error(audioElement());
            await act(async () => undefined);

            expect(mockGetChat).not.toHaveBeenCalled();
            expect(mockToast).not.toHaveBeenCalled();
        });
    });
});
