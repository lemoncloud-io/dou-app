import '@testing-library/jest-dom';

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import type { DomainChat, RoomMediaItem } from '@chatic/runtime';
import { MemoryStore } from '@chatic/storage';

import { readHiddenMedia, setLocalMediaPrefsStorage } from '../lib/localMediaPrefs';
import { resetRoomAudioStore } from '../stores/roomAudioStore';
import { RoomFilesPage } from './RoomFilesPage';

// Naming follows the room's chain, which has its own suite; here the row's snapshot is enough.
// One graph object, as the runtime hands out: a new one per render would resubscribe forever.
let mockGraphInstance: unknown;
const mockRoomGraph = () => {
    mockGraphInstance ??= jest.requireMock('@chatic/runtime').runtime.data.getCloudRepositories();
    return mockGraphInstance;
};
jest.mock('../hooks/useRoomSenderName', () => ({
    useRoomSenderName: () => (chat: { ownerId?: string; owner$?: { name?: string } }) =>
        chat.owner$?.name ?? chat.ownerId ?? '',
}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, vars?: { count?: number }) => (vars?.count !== undefined ? `${key}:${vars.count}` : key),
        i18n: { language: 'en' },
    }),
}));
const mockNavigate = jest.fn();
jest.mock('@chatic/shared', () => ({
    ...jest.requireActual('@chatic/shared'),
    useNavigateWithTransition: () => mockNavigate,
}));
const mockToast = jest.fn();
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: (arg: unknown) => mockToast(arg) }));
// The real action is a Radix toast part that needs a mounted toast around it; a plain button is enough
// to press the undo it carries.
jest.mock('@chatic/ui-kit/components/ui/toast', () => ({
    ToastAction: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
        <button type="button" onClick={onClick}>
            {children}
        </button>
    ),
}));

const mockListRoomMedia = jest.fn();
const mockCountRoomMedia = jest.fn();
const mockRefreshList = jest.fn();
jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({
        session: {
            useSessionSelection: () => ({ selectedCloudId: 'c1' }),
            useUidInCloud: () => 'u1',
        },
        data: {
            useRuntimeRepositories: () => mockRoomGraph(),
            getCloudRepositories: () => ({
                chat: {
                    listRoomMedia: mockListRoomMedia,
                    countRoomMedia: mockCountRoomMedia,
                    refreshList: mockRefreshList,
                    observeList: (_input: unknown, callback: () => void) => {
                        callback();
                        return () => undefined;
                    },
                },
            }),
        },
    })
);
jest.mock('../hooks/useChannel', () => ({ useChannel: () => ({ channel: { id: 'ch-1', cid: 'c1' } }) }));
// Saving and sharing have their own suites; here they only have to be reachable.
const mockSaveAll = jest.fn();
jest.mock('../hooks/useFileDownloads', () => ({
    useFileDownloads: () => ({ saveAll: mockSaveAll, share: jest.fn(), open: jest.fn() }),
}));
let mockCanShare = true;
const mockRun = jest.fn();
jest.mock('../hooks/useImageExports', () => ({
    isExportableUrl: (url: string | undefined) => !!url && url.startsWith('https:'),
    useImageExports: () => ({
        runAll: jest.fn(),
        run: (...args: unknown[]) => mockRun(...args),
        canShare: mockCanShare,
        canExport: true,
        busyFor: () => undefined,
        stopOnClose: jest.fn(),
    }),
}));
jest.mock('../utils/openExternalUrl', () => ({ openExternalUrl: jest.fn() }));

const NOV_2026 = Date.UTC(2026, 10, 11, 12);
const OCT_2026 = Date.UTC(2026, 9, 3, 12);

/** A cached message with one audio upload in slot 0. */
const audioItem = (chatNo: number, sentAt = NOV_2026): RoomMediaItem => ({
    kind: 'audio',
    idx: 0,
    ref: `up-${chatNo}`,
    chatId: `ch-1:${chatNo}`,
    chatNo,
    chat: {
        id: `ch-1:${chatNo}`,
        cid: 'c1',
        channelId: 'ch-1',
        chatNo,
        ownerId: 'u2',
        owner$: { name: 'Sunny' },
        createdAtMs: sentAt,
        upload$$: [
            {
                id: `up-${chatNo}`,
                stereo: 'audio',
                status: 'ready',
                contentType: 'audio/mp4',
                name: `take-${chatNo}.m4a`,
                contentSize: 1000,
                orgUrl: `https://s3/${chatNo}.m4a`,
            },
        ],
    } as unknown as DomainChat,
});

/** A cached message with one photo in slot 0. */
const photoItem = (chatNo: number): RoomMediaItem => ({
    ...audioItem(chatNo),
    kind: 'image',
    chat: {
        ...audioItem(chatNo).chat,
        upload$$: [
            {
                id: `up-${chatNo}`,
                stereo: 'image',
                status: 'ready',
                contentType: 'image/png',
                name: `photo-${chatNo}.png`,
                contentSize: 1000,
                orgUrl: `https://s3/${chatNo}.png`,
            },
        ],
    } as unknown as DomainChat,
});

/** The photos tab's only page, finished; other kinds answer empty. */
const photoPage = (items: RoomMediaItem[]) =>
    mockListRoomMedia.mockImplementation((input: { kind: string }) =>
        Promise.resolve(input.kind === 'image' ? { items, nextCursorNo: null } : { items: [], nextCursorNo: null })
    );

/** The audio tab's only page, finished; other kinds answer empty. */
const audioPage = (items: RoomMediaItem[]) =>
    mockListRoomMedia.mockImplementation((input: { kind: string }) =>
        Promise.resolve(input.kind === 'audio' ? { items, nextCursorNo: null } : { items: [], nextCursorNo: null })
    );

const renderPage = (tab = 'audio') =>
    render(
        <MemoryRouter initialEntries={[`/channels/ch-1/files?tab=${tab}`]}>
            <Routes>
                <Route path="/channels/:channelId/files" element={<RoomFilesPage />} />
            </Routes>
        </MemoryRouter>
    );

const bar = () => screen.getByRole('toolbar');
const barButton = (name: string) => within(bar()).getByRole('button', { name });

describe('RoomFilesPage', () => {
    beforeEach(() => {
        setLocalMediaPrefsStorage(new MemoryStore());
        resetRoomAudioStore();
        mockListRoomMedia.mockReset();
        mockCountRoomMedia.mockReset().mockResolvedValue({ image: 3, video: 2, file: 1, audio: 4, link: 0 });
        mockRefreshList.mockReset().mockResolvedValue({ cursorNo: 0 });
        mockToast.mockReset();
        mockNavigate.mockReset();
        mockSaveAll.mockReset();
    });

    afterAll(() => setLocalMediaPrefsStorage());

    it('lists audio files under the month they were sent', async () => {
        audioPage([audioItem(9), audioItem(8), audioItem(2, OCT_2026)]);
        renderPage();

        await screen.findByText('take-9.m4a');
        expect(screen.getByText('take-8.m4a')).toBeInTheDocument();
        expect(screen.getByText('take-2.m4a')).toBeInTheDocument();
        const november = screen.getByText('November 2026');
        const october = screen.getByText('October 2026');
        // Newest month first, each file below its own month.
        expect(
            november.compareDocumentPosition(screen.getByText('take-8.m4a')) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();
        expect(
            october.compareDocumentPosition(screen.getByText('take-2.m4a')) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();
        expect(
            screen.getByText('take-8.m4a').compareDocumentPosition(october) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();
    });

    it('numbers the open tab only, as the design does, photos and videos counted together', async () => {
        audioPage([audioItem(9)]);
        renderPage();

        expect(await screen.findByRole('tab', { name: 'chat.files.tab.audio 4' })).toHaveAttribute(
            'aria-selected',
            'true'
        );
        expect(screen.getByRole('tab', { name: 'chat.files.tab.media' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'chat.files.tab.file' })).toBeInTheDocument();
    });

    it('keeps the search field behind the header button', async () => {
        audioPage([audioItem(9), audioItem(8)]);
        renderPage();
        await screen.findByText('take-9.m4a');
        expect(screen.queryByRole('searchbox')).toBeNull();
        expect(screen.queryByPlaceholderText('chat.files.search')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'chat.files.searchLabel' }));
        fireEvent.change(screen.getByPlaceholderText('chat.files.search'), { target: { value: 'take-8' } });
        expect(screen.queryByText('take-9.m4a')).toBeNull();
        expect(screen.getByText('take-8.m4a')).toBeInTheDocument();
    });

    it('enters selection from the header, with the selection header and bar', async () => {
        audioPage([audioItem(9), audioItem(8)]);
        renderPage();
        await screen.findByText('take-9.m4a');

        fireEvent.click(screen.getByRole('button', { name: 'chat.files.select' }));

        expect(screen.getByText('chat.files.selectItems')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'chat.files.cancel' })).toBeInTheDocument();
        expect(barButton('chat.files.delete')).toBeDisabled();

        fireEvent.click(screen.getByRole('checkbox', { name: /take-9\.m4a/ }));
        expect(screen.getByText('chat.files.selectedCount:1')).toBeInTheDocument();
        expect(barButton('chat.files.delete')).toBeEnabled();
    });

    it('enters selection with the held row picked on a long press', async () => {
        audioPage([audioItem(9), audioItem(8)]);
        renderPage();
        const title = await screen.findByText('take-9.m4a');

        jest.useFakeTimers();
        try {
            fireEvent.pointerDown(title);
            act(() => {
                jest.advanceTimersByTime(500);
            });
        } finally {
            jest.useRealTimers();
        }

        expect(screen.getByText('chat.files.selectedCount:1')).toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: /take-9\.m4a/ })).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByRole('checkbox', { name: /take-8\.m4a/ })).toHaveAttribute('aria-checked', 'false');
    });

    it('allows only delete past ten picked, and says why', async () => {
        audioPage(Array.from({ length: 11 }, (_, at) => audioItem(20 - at)));
        renderPage();
        await screen.findByText('take-20.m4a');

        fireEvent.click(screen.getByRole('button', { name: 'chat.files.select' }));
        fireEvent.click(screen.getByRole('button', { name: 'chat.files.selectAll' }));

        expect(screen.getByText('chat.files.selectedCount:11')).toBeInTheDocument();
        expect(barButton('chat.attach.audio.save')).toBeDisabled();
        expect(barButton('chat.attach.audio.share')).toBeDisabled();
        expect(barButton('chat.files.delete')).toBeEnabled();
        expect(screen.getByText('chat.files.exportLimit')).toBeInTheDocument();
    });

    it('allows share for exactly one picked', async () => {
        audioPage([audioItem(9), audioItem(8)]);
        renderPage();
        await screen.findByText('take-9.m4a');
        fireEvent.click(screen.getByRole('button', { name: 'chat.files.select' }));

        fireEvent.click(screen.getByRole('checkbox', { name: /take-9\.m4a/ }));
        expect(barButton('chat.attach.audio.share')).toBeEnabled();
        expect(barButton('chat.attach.audio.save')).toBeEnabled();

        fireEvent.click(screen.getByRole('checkbox', { name: /take-8\.m4a/ }));
        expect(barButton('chat.attach.audio.share')).toBeDisabled();
        expect(barButton('chat.attach.audio.save')).toBeEnabled();
        expect(screen.queryByText('chat.files.exportLimit')).not.toBeInTheDocument();
    });

    it('keeps share off for a photo where the browser cannot share files', async () => {
        mockCanShare = false;
        photoPage([photoItem(9)]);
        renderPage('media');
        await screen.findByLabelText(/chat\.attach\.tile/);
        fireEvent.click(screen.getByRole('button', { name: 'chat.files.select' }));
        // Selecting, a press on the tile picks it.
        fireEvent.click(screen.getByLabelText(/chat\.attach\.tile/));

        expect(barButton('chat.attach.audio.share')).toBeDisabled();
        expect(barButton('chat.attach.audio.save')).toBeEnabled();
        mockCanShare = true;
    });

    it('offers share and save for the showing photo in its viewer', async () => {
        photoPage([photoItem(9)]);
        renderPage('media');
        fireEvent.click(await screen.findByLabelText(/chat\.attach\.tile/));

        const viewer = await screen.findByRole('dialog');
        fireEvent.click(within(viewer).getByRole('button', { name: 'chat.attach.export.save' }));

        expect(within(viewer).getByRole('button', { name: 'chat.attach.export.share' })).toBeInTheDocument();
        expect(mockRun).toHaveBeenCalledWith(
            'save',
            expect.objectContaining({ uploadId: 'up-9', kind: 'image', chatId: 'ch-1:9' })
        );
    });

    it('hides the picked files on this device after a confirm, and an undo shows them again', async () => {
        audioPage([audioItem(9), audioItem(8)]);
        renderPage();
        await screen.findByText('take-9.m4a');
        fireEvent.click(screen.getByRole('button', { name: 'chat.files.select' }));
        fireEvent.click(screen.getByRole('checkbox', { name: /take-9\.m4a/ }));

        fireEvent.click(barButton('chat.files.delete'));
        const dialog = await screen.findByRole('alertdialog');
        expect(within(dialog).getByText('chat.files.hideTitleOne')).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole('button', { name: 'chat.files.delete' }));

        expect([...readHiddenMedia({ cid: 'c1', uid: 'u1' })]).toEqual(['ch-1:9:0']);
        await waitFor(() => expect(screen.queryByText('take-9.m4a')).not.toBeInTheDocument());
        expect(screen.getByText('take-8.m4a')).toBeInTheDocument();
        // Selection mode is over: the ordinary header is back and the bar is gone.
        expect(screen.getByRole('button', { name: 'chat.files.select' })).toBeInTheDocument();
        expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();

        expect(mockToast).toHaveBeenCalledTimes(1);
        const shown = mockToast.mock.calls[0][0] as { title: string; action: ReactElement };
        expect(shown.title).toBe('chat.files.hidden:1');
        render(shown.action);
        act(() => {
            fireEvent.click(screen.getByRole('button', { name: 'chat.files.undo' }));
        });

        expect(readHiddenMedia({ cid: 'c1', uid: 'u1' }).size).toBe(0);
        expect(await screen.findByText('take-9.m4a')).toBeInTheDocument();
    });

    it('says the audio tab is empty when nothing was found', async () => {
        audioPage([]);
        renderPage();

        // The tab looks further by itself; once the server has nothing older, there is nothing to offer.
        await waitFor(() => expect(mockRefreshList).toHaveBeenCalledTimes(1));
        await waitFor(() =>
            expect(screen.queryByRole('button', { name: /chat\.files\.(findOlder|searching)/ })).not.toBeInTheDocument()
        );
        expect(screen.getByText('chat.files.empty.audio')).toBeInTheDocument();
    });

    it('offers to look for older files once this device’s cache has run out', async () => {
        audioPage([audioItem(9)]);
        mockRefreshList.mockResolvedValue({ cursorNo: 3 });
        renderPage();
        await screen.findByText('take-9.m4a');

        const findOlder = await screen.findByRole('button', { name: 'chat.files.findOlder' });
        fireEvent.click(findOlder);

        await waitFor(() =>
            expect(mockRefreshList).toHaveBeenCalledWith({ channelId: 'ch-1', cursorNo: 9, limit: 50 })
        );
    });
});
