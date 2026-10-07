import '@testing-library/jest-dom';

import { act, fireEvent, render, screen, within } from '@testing-library/react';

import type { ChatAttachmentSource } from '@chatic/data';
import { IDENTITY_PHOTO_EDIT, type PhotoEdit } from '@chatic/web-ui-kit';

import type { AttachmentPick, AttachmentPicker } from '../../../bridge/attachmentPicker';
import type { PhotoPicker } from '../hooks/usePhotoPicker';
import { INPUT_CLICK_WINDOW_MS, useChatImageAttach } from './ChatImageAttach';

const toast = jest.fn();
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: (arg: unknown) => toast(arg) }));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
    }),
}));

const openSettings = jest.fn();
jest.mock('../../../bridge/appBridge', () => ({ appBridge: { openSettings: () => openSettings() } }));

let mockNative = false;
jest.mock('@chatic/bridges', () => ({ ...jest.requireActual('@chatic/bridges'), isNative: () => mockNative }));
let mockAppleTouch = false;
jest.mock('../utils/attachSources', () => ({
    ...jest.requireActual('../utils/attachSources'),
    isAppleTouchWebKit: () => mockAppleTouch,
}));

const unsupportedPicker = (): PhotoPicker => ({
    supported: false,
    access: null,
    recent: [],
    probe: jest.fn().mockResolvedValue(undefined),
    gridOpen: false,
    openGrid: jest.fn(),
    closeGrid: jest.fn(),
    albumsOpen: false,
    toggleAlbums: jest.fn(),
    albums: [],
    album: { title: 'Recents' },
    selectAlbum: jest.fn(),
    count: 0,
    photoAt: () => undefined,
    loading: false,
    setVisibleRange: jest.fn(),
    picked: [],
    toggle: jest.fn(),
    takePicked: jest.fn().mockResolvedValue({ items: [], refused: [] }),
    preparing: false,
    manageSelection: jest.fn().mockResolvedValue(undefined),
    editAssets: new Map(),
    loadForEdit: jest.fn(),
    edits: new Map(),
    setEdit: jest.fn(),
    restoreEdits: jest.fn(),
});
// The component's own picker is the browser/old-app one unless a test injects another.
jest.mock('../hooks/usePhotoPicker', () => ({
    ...jest.requireActual('../hooks/usePhotoPicker'),
    usePhotoPicker: () => mockOwnPicker,
}));
jest.mock('../hooks/usePhotoGridColumns', () => ({
    usePhotoGridColumns: () => ({ columns: 3, setColumns: jest.fn() }),
}));
let mockGrouped = true;
const mockSetGrouped = jest.fn();
jest.mock('../hooks/usePhotoSendGrouping', () => ({
    usePhotoSendGrouping: () => ({ grouped: mockGrouped, setGrouped: (value: boolean) => mockSetGrouped(value) }),
}));
let mockOwnPicker: PhotoPicker = unsupportedPicker();

const photo = (name: string, type = 'image/jpeg', lastModified = 1) => new File(['x'], name, { type, lastModified });

const Harness = ({
    sendImages,
    disabled,
    picker,
    shellPicker,
    now,
}: {
    sendImages: (files: ChatAttachmentSource[], options?: { separately?: boolean }) => Promise<void>;
    disabled?: boolean;
    picker?: PhotoPicker;
    shellPicker?: AttachmentPicker;
    now?: () => number;
}) => {
    const { button, overlays } = useChatImageAttach({ sendImages, disabled, picker, shellPicker, now });
    return (
        <>
            {button}
            {overlays}
        </>
    );
};

const pick = (testId: string, files: File[]) => {
    const input = screen.getByTestId(testId) as HTMLInputElement;
    act(() => {
        fireEvent.change(input, { target: { files } });
    });
    return input;
};

beforeEach(() => {
    toast.mockClear();
    openSettings.mockClear();
    mockOwnPicker = unsupportedPicker();
    mockGrouped = true;
    mockSetGrouped.mockClear();
});

describe('useChatImageAttach', () => {
    it('sends what was picked at once, in pick order', () => {
        const sendImages = jest.fn().mockResolvedValue(undefined);
        render(<Harness sendImages={sendImages} />);

        pick('chat-attach-library', [photo('a.jpg', 'image/jpeg', 1), photo('b.png', 'image/png', 2)]);

        expect(sendImages).toHaveBeenCalledTimes(1);
        expect(sendImages.mock.calls[0][0].map((f: File) => f.name)).toEqual(['a.jpg', 'b.png']);
        expect(toast).not.toHaveBeenCalled();
    });

    it('sends the rest and says why once when part of the pick is refused', () => {
        const sendImages = jest.fn().mockResolvedValue(undefined);
        render(<Harness sendImages={sendImages} />);

        pick('chat-attach-library', [photo('a.heic', 'image/heic'), photo('b.pdf', 'application/pdf'), photo('c.jpg')]);

        expect(sendImages.mock.calls[0][0].map((f: File) => f.name)).toEqual(['c.jpg']);
        expect(toast).toHaveBeenCalledTimes(1);
        expect(toast.mock.calls[0][0].title).toContain('chat.attach.rejected.unsupported');
    });

    it('sends nothing when nothing passes', () => {
        const sendImages = jest.fn().mockResolvedValue(undefined);
        render(<Harness sendImages={sendImages} />);

        pick('chat-attach-library', [photo('a.gif', 'video/mp4')]);

        expect(sendImages).not.toHaveBeenCalled();
    });

    it('cuts a pick at ten and names the limit', () => {
        const sendImages = jest.fn().mockResolvedValue(undefined);
        render(<Harness sendImages={sendImages} />);

        pick(
            'chat-attach-library',
            Array.from({ length: 11 }, (_, i) => photo(`p${i}.jpg`, 'image/jpeg', i))
        );

        expect(sendImages.mock.calls[0][0]).toHaveLength(10);
        expect(toast.mock.calls[0][0].title).toBe('chat.attach.rejected.limit:{"max":10}');
    });

    // Without clearing, picking the same photo right after would not fire a change at all.
    it('clears the input so the same photo can be picked again', () => {
        render(<Harness sendImages={jest.fn().mockResolvedValue(undefined)} />);

        const input = pick('chat-attach-camera', [photo('a.jpg')]);

        expect(input.value).toBe('');
    });

    it('tells the user when the send itself fails', async () => {
        const sendImages = jest.fn().mockRejectedValue(new Error('offline'));
        render(<Harness sendImages={sendImages} />);

        pick('chat-attach-library', [photo('a.jpg')]);
        await act(async () => undefined);

        expect(toast).toHaveBeenCalledWith({ title: 'chat.attach.sendFailed', variant: 'destructive' });
    });

    it('gives the camera its own capturing input and keeps the album one free of it', () => {
        render(<Harness sendImages={jest.fn()} />);

        expect(screen.getByTestId('chat-attach-camera')).toHaveAttribute('capture', 'environment');
        expect(screen.getByTestId('chat-attach-library')).not.toHaveAttribute('capture');
        expect(screen.getByTestId('chat-attach-library')).toHaveAttribute('multiple');
    });

    it('locks the button with the composer', () => {
        render(<Harness sendImages={jest.fn()} disabled />);

        expect(screen.getByRole('button', { name: 'chat.attach.open' })).toBeDisabled();
    });
});

describe('useChatImageAttach — in-app grid', () => {
    const gridPicker = (over: Partial<PhotoPicker> = {}): PhotoPicker => ({
        ...unsupportedPicker(),
        supported: true,
        access: 'granted',
        recent: [{ id: 'r1', src: 'data:r1' }],
        ...over,
    });
    const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'chat.attach.open' }));

    // Opening the menu is how an unknown shell is learned, and how the strip stays fresh.
    it('probes the library when the menu opens', () => {
        const picker = gridPicker({ supported: null });
        render(<Harness sendImages={jest.fn()} picker={picker} />);

        openMenu();

        expect(picker.probe).toHaveBeenCalledTimes(1);
    });

    it('does not ask a shell already known to have no picker', () => {
        const picker = unsupportedPicker();
        render(<Harness sendImages={jest.fn()} picker={picker} />);

        openMenu();

        expect(picker.probe).not.toHaveBeenCalled();
    });

    it('opens the grid from the photos entry instead of the file input', () => {
        const picker = gridPicker();
        render(<Harness sendImages={jest.fn()} picker={picker} />);
        const input = screen.getByTestId('chat-attach-library') as HTMLInputElement;
        const click = jest.spyOn(input, 'click');

        openMenu();
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.photo' }));

        expect(picker.openGrid).toHaveBeenCalledWith(undefined);
        expect(click).not.toHaveBeenCalled();
    });

    it('opens the grid with the tapped recent photo already picked', () => {
        const picker = gridPicker();
        render(<Harness sendImages={jest.fn()} picker={picker} />);

        openMenu();
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.recentPhoto:{"position":1}' }));

        expect(picker.openGrid).toHaveBeenCalledWith({ id: 'r1', src: 'data:r1' });
    });

    it('sends to settings instead of opening an empty grid when access is denied', () => {
        const picker = gridPicker({ access: 'denied' });
        render(<Harness sendImages={jest.fn()} picker={picker} />);

        openMenu();
        expect(screen.queryByRole('button', { name: 'chat.attach.seeAll' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.photo' }));

        expect(picker.openGrid).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.permission.settings' }));
        expect(openSettings).toHaveBeenCalledTimes(1);
    });

    it('sends the grid pick through the same judge as a file pick', async () => {
        const sendImages = jest.fn().mockResolvedValue(undefined);
        const picker = gridPicker({
            gridOpen: true,
            picked: [{ id: 'p1', src: 'data:p1' }],
            count: 1,
            photoAt: (index: number) => [{ id: 'p1', src: 'data:p1' }][index],
            takePicked: jest
                .fn()
                .mockResolvedValue({ items: [photo('p1.jpg'), photo('p2.heic', 'image/heic')], refused: [] }),
        });
        render(<Harness sendImages={sendImages} picker={picker} />);

        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.send:{"count":1}' }));
        await act(async () => undefined);

        expect(sendImages.mock.calls[0][0].map((f: File) => f.name)).toEqual(['p1.jpg']);
        expect(toast.mock.calls[0][0].title).toContain('chat.attach.rejected.unsupported');
    });

    it('sends the photos and videos the grid kept, and names a video the shell would not keep', async () => {
        const sendImages = jest.fn().mockResolvedValue(undefined);
        const kept = {
            uri: 'file:///c/attach-pick/a/v.mp4',
            name: 'v.mp4',
            type: 'video/mp4',
            size: 9,
            kind: 'video' as const,
        };
        const picker = gridPicker({
            gridOpen: true,
            picked: [{ id: 'p1', src: 'data:p1' }],
            count: 1,
            photoAt: (index: number) => [{ id: 'p1', src: 'data:p1' }][index],
            takePicked: jest.fn().mockResolvedValue({
                items: [photo('p1.jpg'), kept],
                refused: [{ name: '', kind: 'video', reason: 'unsupported' }],
            }),
        });
        render(<Harness sendImages={sendImages} picker={picker} />);

        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.send:{"count":1}' }));
        await act(async () => undefined);

        expect(sendImages.mock.calls[0][0]).toEqual([expect.objectContaining({ name: 'p1.jpg' }), kept]);
        expect(toast).toHaveBeenCalledTimes(1);
        expect(toast.mock.calls[0][0].title).toContain('chat.attach.rejected.unsupportedVideo');
    });

    it('says the grid is preparing and takes no second send meanwhile', () => {
        const picker = gridPicker({
            gridOpen: true,
            preparing: true,
            picked: [{ id: 'v', src: 'data:v', kind: 'video' }],
            count: 1,
            photoAt: (index: number) => [{ id: 'v', src: 'data:v', kind: 'video' as const }][index],
        });
        render(<Harness sendImages={jest.fn()} picker={picker} />);

        const button = screen.getByRole('button', { name: 'chat.attach.preparing' });
        fireEvent.click(button);

        expect(picker.takePicked).not.toHaveBeenCalled();
    });
});

describe('useChatImageAttach — videos and documents', () => {
    const openSource = (name: 'chat.attach.source.album' | 'chat.attach.source.files') => {
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.open' }));
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.file' }));
        fireEvent.click(screen.getByRole('button', { name }));
    };
    const shellPicker = (answer: () => Promise<AttachmentPick | null>, unsupported = false): AttachmentPicker => ({
        pick: jest.fn(answer),
        prepareVideo: jest.fn(),
        isUnsupported: () => unsupported,
        reset: jest.fn(),
    });
    const shellVideo = {
        uri: 'file:///c/attach-pick/a/v.mp4',
        name: 'v.mp4',
        type: 'video/mp4',
        size: 9,
        kind: 'video' as const,
    };
    const flush = () => act(async () => undefined);

    it('opens the app’s album picker from the file entry’s second step and sends what it picked', async () => {
        const sendImages = jest.fn().mockResolvedValue(undefined);
        const shell = shellPicker(async () => ({ items: [shellVideo, photo('a.jpg')], refused: [] }));
        render(<Harness sendImages={sendImages} shellPicker={shell} />);

        openSource('chat.attach.source.album');
        await flush();

        expect(shell.pick).toHaveBeenCalledWith({ source: 'media', selectionLimit: 10 });
        expect(sendImages.mock.calls[0][0]).toEqual([shellVideo, expect.objectContaining({ name: 'a.jpg' })]);
        expect(toast).not.toHaveBeenCalled();
    });

    it('reports what the shell would not copy, naming the limit of the kind the shell says it was', async () => {
        const sendImages = jest.fn().mockResolvedValue(undefined);
        // A name says nothing reliable: a `.mov` is no format the page knows, yet it met the video limit.
        const shell = shellPicker(async () => ({
            items: [],
            refused: [{ name: 'clip.mov', kind: 'video', reason: 'too-large' }],
        }));
        render(<Harness sendImages={sendImages} shellPicker={shell} />);

        openSource('chat.attach.source.album');
        await flush();

        expect(shell.pick).toHaveBeenCalledWith({ source: 'media', selectionLimit: 10 });
        expect(toast.mock.calls[0][0].title).toContain('chat.attach.rejected.too-large.video');
        expect(sendImages).not.toHaveBeenCalled();
    });

    it('says nothing when a second tap meets the picker still busy with the first', async () => {
        const shell = shellPicker(async () => {
            throw Object.assign(new Error('busy'), { code: 'BUSY' });
        });
        render(<Harness sendImages={jest.fn()} shellPicker={shell} />);

        openSource('chat.attach.source.files');
        await flush();

        expect(toast).not.toHaveBeenCalled();
    });

    describe('on iOS WebKit without the app picker', () => {
        beforeEach(() => {
            mockAppleTouch = true;
        });
        afterEach(() => {
            mockAppleTouch = false;
            mockNative = false;
        });
        const openSheet = () => {
            fireEvent.click(screen.getByRole('button', { name: 'chat.attach.open' }));
            fireEvent.click(screen.getByRole('button', { name: 'chat.attach.file' }));
        };

        it('tells an app user that an update sends videos', () => {
            mockNative = true;
            render(<Harness sendImages={jest.fn()} shellPicker={shellPicker(async () => null, true)} />);

            openSheet();

            expect(screen.getByText('chat.attach.source.videoNeedsUpdate')).toBeInTheDocument();
        });

        it('tells a browser user that videos go from the app, not to update one', () => {
            render(<Harness sendImages={jest.fn()} shellPicker={shellPicker(async () => null, true)} />);

            openSheet();

            expect(screen.getByText('chat.attach.source.videoInApp')).toBeInTheDocument();
            expect(screen.queryByText('chat.attach.source.videoNeedsUpdate')).not.toBeInTheDocument();
        });
    });

    it('opens the page’s own input in the same tap when the shell answers it has no picker', async () => {
        const shell = shellPicker(async () => null);
        render(<Harness sendImages={jest.fn()} shellPicker={shell} now={() => 0} />);
        const click = jest.spyOn(screen.getByTestId('chat-attach-album') as HTMLInputElement, 'click');

        openSource('chat.attach.source.album');
        await flush();

        expect(click).toHaveBeenCalledTimes(1);
    });

    // iOS opens a page input only within about a second of the tap; a late click would do nothing.
    it('asks for another tap instead of a click the page would no longer be allowed', async () => {
        let clock = 0;
        const shell = shellPicker(async () => {
            clock += INPUT_CLICK_WINDOW_MS + 1;
            return null;
        });
        render(<Harness sendImages={jest.fn()} shellPicker={shell} now={() => clock} />);
        const click = jest.spyOn(screen.getByTestId('chat-attach-files') as HTMLInputElement, 'click');

        openSource('chat.attach.source.files');
        await flush();

        expect(click).not.toHaveBeenCalled();
        expect(toast).toHaveBeenCalledWith({ title: 'chat.attach.tapAgain' });
    });

    it('opens the page input straight from the tap once the shell is known to have no picker', () => {
        const shell = shellPicker(async () => null, true);
        render(<Harness sendImages={jest.fn()} shellPicker={shell} />);
        const click = jest.spyOn(screen.getByTestId('chat-attach-files') as HTMLInputElement, 'click');

        openSource('chat.attach.source.files');

        expect(shell.pick).not.toHaveBeenCalled();
        expect(click).toHaveBeenCalledTimes(1);
    });

    it('lets the album input take an mp4 and the files input a document, outside iOS', () => {
        render(<Harness sendImages={jest.fn()} />);

        expect((screen.getByTestId('chat-attach-album') as HTMLInputElement).accept).toContain('video/mp4');
        expect((screen.getByTestId('chat-attach-files') as HTMLInputElement).accept).toContain('application/pdf');
        expect((screen.getByTestId('chat-attach-files') as HTMLInputElement).accept).not.toContain('image/');
    });

    it('sends a page video and document through the full judgement, and refuses a QuickTime video by name', () => {
        const sendImages = jest.fn().mockResolvedValue(undefined);
        render(<Harness sendImages={sendImages} />);

        pick('chat-attach-album', [photo('clip.mov', 'video/quicktime'), photo('clip.mp4', 'video/mp4')]);

        expect(sendImages.mock.calls[0][0].map((f: File) => f.name)).toEqual(['clip.mp4']);
        expect(toast.mock.calls[0][0].title).toContain('chat.attach.rejected.unsupportedVideo');
    });

    it('sends an untyped HWP from the files input by its extension, and refuses any other file it lets through', () => {
        const sendImages = jest.fn().mockResolvedValue(undefined);
        render(<Harness sendImages={sendImages} />);

        // iOS WebKit hands HWP and HWPX over with no type; the generic type in `accept` admits a zip too.
        pick('chat-attach-files', [photo('a.zip', 'application/zip'), photo('보고서.hwp', ''), photo('b.hwpx', '')]);

        expect(sendImages.mock.calls[0][0].map((f: File) => f.name)).toEqual(['보고서.hwp', 'b.hwpx']);
        expect(toast).toHaveBeenCalledTimes(1);
        expect(toast.mock.calls[0][0].title).toContain('chat.attach.rejected.unsupported');
    });

    it('keeps the photos entry to photos, whatever the system picker let through', () => {
        const sendImages = jest.fn().mockResolvedValue(undefined);
        render(<Harness sendImages={sendImages} />);

        pick('chat-attach-library', [photo('clip.mp4', 'video/mp4'), photo('a.jpg')]);

        expect(sendImages.mock.calls[0][0].map((f: File) => f.name)).toEqual(['a.jpg']);
    });
});

describe('useChatImageAttach — editing and grouping in the grid', () => {
    const turned: PhotoEdit = { ...IDENTITY_PHOTO_EDIT, rotation: 90 };
    const items = [
        { id: 'v', src: 'data:v', kind: 'video' as const, durationMs: 3000 },
        { id: 'p1', src: 'data:p1' },
        { id: 'p2', src: 'data:p2' },
    ];
    const gridPicker = (over: Partial<PhotoPicker> = {}): PhotoPicker => ({
        ...unsupportedPicker(),
        supported: true,
        access: 'granted',
        gridOpen: true,
        picked: items,
        count: items.length,
        photoAt: (index: number) => items[index],
        takePicked: jest.fn().mockResolvedValue({ items: [photo('p1.jpg', 'image/jpeg', 1)], refused: [] }),
        ...over,
    });
    const editor = () => screen.getByRole('dialog', { name: 'chat.attach.edit.title' });
    const queryEditor = () => screen.queryByRole('dialog', { name: 'chat.attach.edit.title' });
    const flush = () => act(async () => undefined);

    it('opens the editor from the Edit button at the first photo it can edit, and reads it and its neighbours', () => {
        const picker = gridPicker();
        render(<Harness sendImages={jest.fn()} picker={picker} />);

        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.edit.open' }));

        expect(editor()).toBeInTheDocument();
        // The video is skipped as a place to start, and never asked to be read.
        expect(picker.loadForEdit).toHaveBeenLastCalledWith('p1', 'p2');
    });

    it('opens the editor at the photo tapped in the picked strip', () => {
        const picker = gridPicker();
        render(<Harness sendImages={jest.fn()} picker={picker} />);

        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.edit.select:{"position":3}' }));

        expect(editor()).toBeInTheDocument();
        expect(picker.loadForEdit).toHaveBeenLastCalledWith('p2', 'p1');
    });

    it('greys the Edit button when nothing picked can be edited', () => {
        const picker = gridPicker({
            picked: [items[0], { id: 'g', src: 'data:g' }],
            editAssets: new Map([
                ['g', { status: 'ready' as const, editable: false, src: 'blob:g', width: 1, height: 1 }],
            ]),
        });
        render(<Harness sendImages={jest.fn()} picker={picker} />);

        expect(screen.getByRole('button', { name: 'chat.attach.edit.open' })).toBeDisabled();
    });

    it('offers no crop on a video', () => {
        render(<Harness sendImages={jest.fn()} picker={gridPicker()} />);

        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.edit.select:{"position":1}' }));

        expect(within(editor()).getByRole('button', { name: 'chat.attach.edit.crop' })).toBeDisabled();
    });

    it('goes back to the grid keeping the edits with Done', () => {
        const picker = gridPicker();
        render(<Harness sendImages={jest.fn()} picker={picker} />);
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.edit.open' }));

        fireEvent.click(within(editor()).getByRole('button', { name: 'chat.attach.edit.done' }));

        expect(queryEditor()).not.toBeInTheDocument();
        expect(picker.restoreEdits).not.toHaveBeenCalled();
    });

    it('drops the editor’s waiting reads once it closes', () => {
        const picker = gridPicker();
        render(<Harness sendImages={jest.fn()} picker={picker} />);
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.edit.open' }));
        expect(picker.loadForEdit).toHaveBeenLastCalledWith('p1', 'p2');

        fireEvent.click(within(editor()).getByRole('button', { name: 'chat.attach.edit.done' }));

        expect(picker.loadForEdit).toHaveBeenLastCalledWith();
    });

    it('leaves at once with ✕ when nothing was changed', () => {
        const picker = gridPicker({ edits: new Map([['p1', turned]]) });
        render(<Harness sendImages={jest.fn()} picker={picker} />);
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.edit.open' }));

        fireEvent.click(within(editor()).getByRole('button', { name: 'chat.attach.edit.close' }));

        expect(queryEditor()).not.toBeInTheDocument();
        expect(screen.queryByText('chat.attach.edit.discard.title')).not.toBeInTheDocument();
    });

    it('asks before ✕ throws edits away, and puts back the edits from when the editor opened', () => {
        const before = new Map([['p1', turned]]);
        const picker = gridPicker({ edits: before });
        const { rerender } = render(<Harness sendImages={jest.fn()} picker={picker} />);
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.edit.open' }));
        // An edit made in the editor.
        const edited = { ...picker, edits: new Map([...before, ['p2', turned]]) };
        rerender(<Harness sendImages={jest.fn()} picker={edited} />);

        fireEvent.click(within(editor()).getByRole('button', { name: 'chat.attach.edit.close' }));
        expect(screen.getByText('chat.attach.edit.discard.title')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.edit.discard.keep' }));
        expect(editor()).toBeInTheDocument();
        expect(picker.restoreEdits).not.toHaveBeenCalled();

        fireEvent.click(within(editor()).getByRole('button', { name: 'chat.attach.edit.close' }));
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.edit.discard.confirm' }));

        expect(picker.restoreEdits).toHaveBeenCalledWith(before);
        expect(queryEditor()).not.toBeInTheDocument();
    });

    it('sends from the editor as the grid would, and closes it onto the grid', async () => {
        const sendImages = jest.fn().mockResolvedValue(undefined);
        const picker = gridPicker();
        render(<Harness sendImages={sendImages} picker={picker} />);
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.edit.open' }));

        fireEvent.click(within(editor()).getByRole('button', { name: 'chat.attach.send:{"count":3}' }));
        await flush();

        expect(picker.takePicked).toHaveBeenCalledTimes(1);
        expect(sendImages.mock.calls[0][0].map((f: File) => f.name)).toEqual(['p1.jpg']);
        expect(queryEditor()).not.toBeInTheDocument();
    });

    it('closes the editor when the grid closes under it', () => {
        const picker = gridPicker();
        const { rerender } = render(<Harness sendImages={jest.fn()} picker={picker} />);
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.edit.open' }));

        rerender(<Harness sendImages={jest.fn()} picker={{ ...picker, gridOpen: false }} />);
        rerender(<Harness sendImages={jest.fn()} picker={picker} />);

        expect(queryEditor()).not.toBeInTheDocument();
    });

    it('names a photo whose edit could not be drawn, and sends the rest', async () => {
        const sendImages = jest.fn().mockResolvedValue(undefined);
        const picker = gridPicker({
            takePicked: jest.fn().mockResolvedValue({ items: [photo('p2.jpg')], refused: [], editFailed: 1 }),
        });
        render(<Harness sendImages={sendImages} picker={picker} />);

        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.send:{"count":3}' }));
        await flush();

        expect(toast).toHaveBeenCalledTimes(1);
        expect(toast.mock.calls[0][0].title).toBe('chat.attach.edit.bakeFailed');
        expect(sendImages.mock.calls[0][0].map((f: File) => f.name)).toEqual(['p2.jpg']);
    });

    it('shows the remembered grouping and stores a change to it', () => {
        mockGrouped = false;
        render(<Harness sendImages={jest.fn()} picker={gridPicker()} />);

        const box = screen.getByRole('checkbox', { name: 'chat.attach.grouped' });
        expect(box).not.toBeChecked();
        fireEvent.click(box);

        expect(mockSetGrouped).toHaveBeenCalledWith(true);
    });

    it('sends the grid pick as one message while grouping is on', async () => {
        const sendImages = jest.fn().mockResolvedValue(undefined);
        const picker = gridPicker({
            takePicked: jest.fn().mockResolvedValue({
                items: [photo('a.jpg', 'image/jpeg', 1), photo('b.jpg', 'image/jpeg', 2)],
                refused: [],
            }),
        });
        render(<Harness sendImages={sendImages} picker={picker} />);

        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.send:{"count":3}' }));
        await flush();

        expect(sendImages).toHaveBeenCalledTimes(1);
        expect(sendImages.mock.calls[0]).toHaveLength(1);
    });

    it('sends the grid pick as one message each while grouping is off', async () => {
        mockGrouped = false;
        const sendImages = jest.fn().mockResolvedValue(undefined);
        const picker = gridPicker({
            takePicked: jest.fn().mockResolvedValue({
                items: [photo('a.jpg', 'image/jpeg', 1), photo('b.jpg', 'image/jpeg', 2)],
                refused: [],
            }),
        });
        render(<Harness sendImages={sendImages} picker={picker} />);

        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.send:{"count":3}' }));
        await flush();

        expect(sendImages.mock.calls[0][0].map((f: File) => f.name)).toEqual(['a.jpg', 'b.jpg']);
        expect(sendImages.mock.calls[0][1]).toEqual({ separately: true });
    });

    // One item is the same message either way; it goes exactly as any other single pick.
    it('sends a single passing item the usual way even while grouping is off', async () => {
        mockGrouped = false;
        const sendImages = jest.fn().mockResolvedValue(undefined);
        const picker = gridPicker({
            takePicked: jest
                .fn()
                .mockResolvedValue({ items: [photo('a.jpg'), photo('b.heic', 'image/heic')], refused: [] }),
        });
        render(<Harness sendImages={sendImages} picker={picker} />);

        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.send:{"count":3}' }));
        await flush();

        expect(sendImages.mock.calls[0]).toHaveLength(1);
    });

    it('keeps every path outside the grid to one message, whatever the grouping', async () => {
        mockGrouped = false;
        const sendImages = jest.fn().mockResolvedValue(undefined);
        const shell: AttachmentPicker = {
            pick: jest.fn(async () => ({
                items: [photo('s1.jpg', 'image/jpeg', 3), photo('s2.jpg', 'image/jpeg', 4)],
                refused: [],
            })),
            prepareVideo: jest.fn(),
            isUnsupported: () => false,
            reset: jest.fn(),
        };
        render(<Harness sendImages={sendImages} shellPicker={shell} />);

        pick('chat-attach-library', [photo('a.jpg', 'image/jpeg', 1), photo('b.jpg', 'image/jpeg', 2)]);
        pick('chat-attach-album', [photo('c.jpg', 'image/jpeg', 1), photo('d.jpg', 'image/jpeg', 2)]);
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.open' }));
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.file' }));
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.source.album' }));
        await flush();

        expect(sendImages).toHaveBeenCalledTimes(3);
        for (const call of sendImages.mock.calls) {
            expect(call).toHaveLength(1);
            expect(call[0]).toHaveLength(2);
        }
    });
});
