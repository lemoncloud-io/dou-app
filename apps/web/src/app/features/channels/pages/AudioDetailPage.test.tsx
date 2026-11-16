import '@testing-library/jest-dom';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import type { DomainChat } from '@chatic/data';

import { useMessageJumpStore } from '../../../stores/useMessageJumpStore';
import { resetRoomAudioStore, useRoomAudioStore } from '../stores/roomAudioStore';
import { AudioDetailPage } from './AudioDetailPage';

// Naming follows the room's chain, which has its own suite; here the row's snapshot is enough.
jest.mock('../hooks/useRoomSenderName', () => ({
    useRoomSenderName: () => (chat: { ownerId?: string; owner$?: { name?: string } }) =>
        chat.owner$?.name ?? chat.ownerId ?? '',
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }));
const mockNavigate = jest.fn();
jest.mock('@chatic/shared', () => ({
    ...jest.requireActual('@chatic/shared'),
    useNavigateWithTransition: () => mockNavigate,
}));

const mockCacheRead = jest.fn();
const mockGetChat = jest.fn();
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSessionSelection: () => ({ selectedCloudId: 'c1' }),
            useUidInCloud: () => 'u1',
        },
        data: (() => {
            // One graph object, as the runtime hands out.
            // Built on first use: the mocks it holds are initialised after this factory runs.
            let graph: unknown;
            const graphOf = () => (graph ??= { chat: { cacheRead: mockCacheRead, getChat: mockGetChat } });
            return { getCloudRepositories: graphOf, useRuntimeRepositories: graphOf };
        })(),
    },
}));
jest.mock('../hooks/useChannel', () => ({ useChannel: () => ({ channel: { id: 'ch-1', cid: 'c1' } }) }));
// The waveform reads and decodes the file; its own suite covers that. Undefined draws the decorative bars.
jest.mock('../hooks/useAudioWaveform', () => ({ useAudioWaveform: () => undefined }));
const mockDeleteServerMessage = jest.fn();
jest.mock('../hooks/useChatMutations', () => ({
    useChatMutations: () => ({ deleteServerMessage: mockDeleteServerMessage }),
}));
jest.mock('../hooks/useFileDownloads', () => ({
    useFileDownloads: () => ({ download: jest.fn(), share: jest.fn(), stateOf: () => 'idle' }),
}));
jest.mock('../../../bridge/shellCapabilities', () => ({ useCanExportImages: () => false }));

const message = (over: Partial<DomainChat> = {}): DomainChat =>
    ({
        id: 'ch-1:7',
        cid: 'c1',
        channelId: 'ch-1',
        chatNo: 7,
        ownerId: 'u2',
        owner$: { name: 'Sunny' },
        createdAtMs: Date.UTC(2026, 10, 11, 12),
        upload$$: [
            {
                id: 'up-7',
                stereo: 'audio',
                status: 'ready',
                contentType: 'audio/mp4',
                name: 'take.m4a',
                contentSize: 2048,
                orgUrl: 'https://s3/take.m4a',
            },
        ],
        ...over,
    }) as unknown as DomainChat;

/** A media element as the store drives it — see `roomAudioStore.test.ts`. */
const fakeAudio = () => ({
    src: '',
    currentTime: 0,
    playbackRate: 1,
    defaultPlaybackRate: 1,
    play: jest.fn(() => Promise.resolve()),
    pause: jest.fn(),
    load: jest.fn(),
    removeAttribute: jest.fn(),
});

const renderPage = () =>
    render(
        <MemoryRouter initialEntries={['/channels/ch-1/audio/7/0']}>
            <Routes>
                <Route path="/channels/:channelId/audio/:chatNo/:idx" element={<AudioDetailPage />} />
            </Routes>
        </MemoryRouter>
    );

const openMore = () => fireEvent.click(screen.getByRole('button', { name: 'chat.attach.audio.more' }));

describe('AudioDetailPage', () => {
    let audio: ReturnType<typeof fakeAudio>;

    beforeEach(() => {
        resetRoomAudioStore();
        audio = fakeAudio();
        useRoomAudioStore.getState().attach(audio as unknown as HTMLMediaElement);
        useMessageJumpStore.getState().clear();
        mockNavigate.mockReset();
        mockDeleteServerMessage.mockReset().mockResolvedValue(undefined);
        mockCacheRead.mockReset().mockResolvedValue(undefined);
        mockGetChat.mockReset().mockResolvedValue(message());
    });

    it('loads the message from the cache, then the server, and shows who sent what', async () => {
        mockCacheRead.mockResolvedValue(message());
        renderPage();

        expect(await screen.findByText('Sunny')).toBeInTheDocument();
        expect(screen.getByText('take.m4a')).toBeInTheDocument();
        expect(mockCacheRead).toHaveBeenCalledWith('ch-1:7');
        await waitFor(() => expect(mockGetChat).toHaveBeenCalledWith({ id: 'ch-1:7' }));
    });

    it('plays through the room’s player, and leaving the screen lets it play on', async () => {
        const { unmount } = renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'chat.attach.audio.play' }));

        expect(useRoomAudioStore.getState().current?.key).toBe('c1/up-7');
        expect(audio.src).toBe('https://s3/take.m4a');
        expect(audio.play).toHaveBeenCalledTimes(1);
        act(() => useRoomAudioStore.getState().onPlaying());
        expect(screen.getByRole('button', { name: 'chat.attach.audio.pause' })).toBeInTheDocument();

        unmount();

        expect(audio.pause).not.toHaveBeenCalled();
        expect(audio.src).toBe('https://s3/take.m4a');
        expect(useRoomAudioStore.getState().current?.key).toBe('c1/up-7');
        expect(useRoomAudioStore.getState().status).toBe('playing');
    });

    it('offers view in chat and reply in thread under more', async () => {
        renderPage();
        await screen.findByText('take.m4a');

        openMore();

        expect(await screen.findByRole('button', { name: 'chat.attach.audio.viewInChat' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'chat.thread.replyAction' })).toBeInTheDocument();
    });

    it('goes to the message in its room and asks the room to jump there', async () => {
        renderPage();
        await screen.findByText('take.m4a');
        openMore();

        fireEvent.click(await screen.findByRole('button', { name: 'chat.attach.audio.viewInChat' }));

        expect(mockNavigate).toHaveBeenCalledWith('/channels/ch-1/room');
        expect(useMessageJumpStore.getState().target).toMatchObject({
            channelId: 'ch-1',
            chatNo: 7,
            threadRootNo: undefined,
        });
    });

    it('has no way back to a message deleted since', async () => {
        mockGetChat.mockResolvedValue(message({ hidden: true } as Partial<DomainChat>));
        renderPage();
        await screen.findByText('take.m4a');

        await waitFor(() => expect(mockGetChat).toHaveBeenCalled());

        openMore();

        // The sheet is open, with none of the rows that lead back to the message.
        expect(await screen.findByRole('dialog')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'chat.attach.audio.viewInChat' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'chat.thread.replyAction' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'chat.room.deleteMessage' })).not.toBeInTheDocument();
    });

    it('offers delete only on my own message', async () => {
        renderPage();
        await screen.findByText('take.m4a');
        openMore();
        await screen.findByRole('button', { name: 'chat.attach.audio.viewInChat' });
        expect(screen.queryByRole('button', { name: 'chat.room.deleteMessage' })).not.toBeInTheDocument();
    });

    it('offers delete on a message I sent', async () => {
        mockGetChat.mockResolvedValue(message({ ownerId: 'u1' }));
        renderPage();
        await screen.findByText('take.m4a');
        openMore();

        expect(await screen.findByRole('button', { name: 'chat.room.deleteMessage' })).toBeInTheDocument();
    });

    it('says the file is gone when the message has no audio in that slot', async () => {
        mockGetChat.mockResolvedValue(
            message({
                upload$$: [{ id: 'up-p', stereo: 'image', status: 'ready', orgUrl: 'https://s3/p' }],
            } as unknown as Partial<DomainChat>)
        );
        renderPage();

        expect(await screen.findByText('chat.attach.audio.detailMissing')).toBeInTheDocument();
    });
});
