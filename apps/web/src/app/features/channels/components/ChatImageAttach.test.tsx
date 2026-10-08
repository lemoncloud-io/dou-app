import '@testing-library/jest-dom';

import { useRef } from 'react';

import { act, fireEvent, render, screen, within } from '@testing-library/react';

import type { ChatAttachmentSource } from '@chatic/data';
import { IDENTITY_PHOTO_EDIT, SLIDE_MS, type PhotoEdit } from '@chatic/web-ui-kit';

import type { AttachmentPick, AttachmentPicker } from '../../../bridge/attachmentPicker';
import { ATTACH_INSET_VAR, KEYBOARD_COVER_MS, KEYBOARD_WAIT_MS } from '../hooks/useAttachPanelSlot';
import type { PhotoPicker } from '../hooks/usePhotoPicker';
import { useComposerDraftStore } from '../stores/useComposerDraftStore';
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
    clearPicked: jest.fn(),
    releaseBytes: jest.fn(),
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

/** What the composer's send button got back from `sendPicked`, last press. */
let sentPicked: boolean | undefined;
/** What the hook told the page about the panel's slide moving the composer, in order. */
let composerSlides: boolean[] = [];

/**
 * The hook as a page wires it: the composer's bar (its ref, which the panel's slot pads), and in it the
 * row of picked photos and the field (its ref, its focus closing the panel); a stand-in for the
 * composer's send button handing `caption` to `sendPicked`; and what the page reads off it.
 */
const Harness = ({
    sendImages,
    disabled,
    picker,
    shellPicker,
    now,
    caption = '',
    onUnsentText,
    scope,
}: {
    sendImages: (files: ChatAttachmentSource[], options?: { separately?: boolean; content?: string }) => Promise<void>;
    disabled?: boolean;
    picker?: PhotoPicker;
    shellPicker?: AttachmentPicker;
    now?: () => number;
    caption?: string;
    onUnsentText?: (text: string) => void;
    scope?: string;
}) => {
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const composerRef = useRef<HTMLDivElement>(null);
    const attach = useChatImageAttach({
        sendImages,
        disabled,
        inputRef,
        composerRef,
        onComposerSlide: sliding => composerSlides.push(sliding),
        picker,
        shellPicker,
        now,
        onUnsentText,
        scope,
    });
    return (
        <div style={{ position: 'relative' }}>
            {attach.button}
            <div ref={composerRef} data-testid="composer-bar">
                <div data-testid="strip-slot">{attach.strip}</div>
                <textarea ref={inputRef} aria-label="composer" onFocus={attach.closePanel} />
            </div>
            <button
                type="button"
                data-testid="composer-send"
                data-ready={String(attach.sendReady)}
                onClick={() => {
                    sentPicked = attach.sendPicked(caption);
                }}
            />
            <output data-testid="attach-state" data-panel-open={String(attach.panelOpen)} />
            {attach.overlays}
        </div>
    );
};

const state = () => screen.getByTestId('attach-state');
/** px the composer's bar keeps clear for the panel, as the panel's slot last wrote it. */
const inset = () => parseFloat(screen.getByTestId('composer-bar').style.getPropertyValue(ATTACH_INSET_VAR)) || 0;
/** Runs the panel's slide to its end, frame by frame, as the page would see it. */
const slideOver = () => act(() => jest.advanceTimersByTime(SLIDE_MS + 32));

const pick = (testId: string, files: File[]) => {
    const input = screen.getByTestId(testId) as HTMLInputElement;
    act(() => {
        fireEvent.change(input, { target: { files } });
    });
    return input;
};

beforeEach(() => {
    useComposerDraftStore.setState({ texts: {}, held: {} });
    toast.mockClear();
    openSettings.mockClear();
    mockOwnPicker = unsupportedPicker();
    mockGrouped = true;
    mockSetGrouped.mockClear();
    sentPicked = undefined;
    composerSlides = [];
});

afterEach(() => {
    document.documentElement.style.removeProperty('--keyboard-height');
    document.documentElement.style.removeProperty('--safe-bottom');
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

    // The grid opens over the panel, on the panel's pick, and closes back onto it.
    it('opens the grid from the photos entry instead of the file input, over the panel', () => {
        const picker = gridPicker();
        render(<Harness sendImages={jest.fn()} picker={picker} />);
        const input = screen.getByTestId('chat-attach-library') as HTMLInputElement;
        const click = jest.spyOn(input, 'click');

        openMenu();
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.photo' }));

        expect(picker.openGrid).toHaveBeenCalledWith();
        expect(click).not.toHaveBeenCalled();
        expect(state()).toHaveAttribute('data-panel-open', 'true');
    });

    it('opens the grid from "see all" without touching the pick', () => {
        const picker = gridPicker({ picked: [{ id: 'r1', src: 'data:r1' }] });
        render(<Harness sendImages={jest.fn()} picker={picker} />);

        openMenu();
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.seeAll' }));

        expect(picker.openGrid).toHaveBeenCalledWith();
        expect(picker.toggle).not.toHaveBeenCalled();
        expect(picker.clearPicked).not.toHaveBeenCalled();
    });

    it('picks a recent photo in place, and shows the pick order on the row', () => {
        const recent = [
            { id: 'r1', src: 'data:r1' },
            { id: 'r2', src: 'data:r2', kind: 'video' as const },
        ];
        const picker = gridPicker({ recent, picked: [{ id: 'g9', src: 'data:g9' }, recent[0]] });
        render(<Harness sendImages={jest.fn()} picker={picker} />);

        openMenu();
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.recentVideo:{"position":2}' }));

        expect(picker.toggle).toHaveBeenCalledWith(recent[1]);
        expect(picker.openGrid).not.toHaveBeenCalled();
        // Picked second, after one picked in the grid that the row does not show.
        const first = screen.getByRole('button', { name: 'chat.attach.recentPhoto:{"position":1}' });
        expect(first).toHaveAttribute('aria-pressed', 'true');
        expect(first).toHaveTextContent('2');
    });

    it('locks the unpicked recent photos at the per-message cap', () => {
        const recent = [
            { id: 'r1', src: 'data:r1' },
            { id: 'r2', src: 'data:r2' },
        ];
        const picked = Array.from({ length: 10 }, (_, i) => ({ id: i === 0 ? 'r1' : `g${i}`, src: `data:g${i}` }));
        render(<Harness sendImages={jest.fn()} picker={gridPicker({ recent, picked })} />);

        openMenu();

        expect(screen.getByRole('button', { name: 'chat.attach.recentPhoto:{"position":2}' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'chat.attach.recentPhoto:{"position":1}' })).toBeEnabled();
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

    it('sends the grid pick through the same judge as a file pick, without a caption', async () => {
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
        expect(sendImages.mock.calls[0]).toHaveLength(1);
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
        readPhotos: jest.fn(async items => ({ items, refused: [] })),
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

    it('lets the album input take an mp4, and the files input a document and a photo kept among files, outside iOS', () => {
        render(<Harness sendImages={jest.fn()} />);

        expect((screen.getByTestId('chat-attach-album') as HTMLInputElement).accept).toContain('video/mp4');
        expect((screen.getByTestId('chat-attach-files') as HTMLInputElement).accept).toContain('application/pdf');
        expect((screen.getByTestId('chat-attach-files') as HTMLInputElement).accept).toContain('image/');
    });

    // An image type in `accept` makes iOS offer the photo library and the camera before the files.
    it('keeps image types out of the files input on iOS WebKit', () => {
        mockAppleTouch = true;
        try {
            render(<Harness sendImages={jest.fn()} />);
            expect((screen.getByTestId('chat-attach-files') as HTMLInputElement).accept).not.toContain('image/');
        } finally {
            mockAppleTouch = false;
        }
    });

    it('sends a page video and document through the full judgement, and refuses a QuickTime video by name', () => {
        const sendImages = jest.fn().mockResolvedValue(undefined);
        render(<Harness sendImages={sendImages} />);

        pick('chat-attach-album', [photo('clip.mov', 'video/quicktime'), photo('clip.mp4', 'video/mp4')]);

        expect(sendImages.mock.calls[0][0].map((f: File) => f.name)).toEqual(['clip.mp4']);
        expect(toast.mock.calls[0][0].title).toContain('chat.attach.rejected.unsupportedVideo');
    });

    it('takes an untyped HWP from the files input by its extension, and refuses any other file it lets through', async () => {
        const sendImages = jest.fn().mockResolvedValue(undefined);
        render(<Harness sendImages={sendImages} />);

        // iOS WebKit hands HWP and HWPX over with no type; the generic type in `accept` admits a zip too.
        pick('chat-attach-files', [photo('a.zip', 'application/zip'), photo('보고서.hwp', ''), photo('b.hwpx', '')]);
        fireEvent.click(screen.getByTestId('composer-send'));
        await flush();

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
        // The grid is still open, and a send from it uses what the editor read.
        expect(picker.releaseBytes).not.toHaveBeenCalled();
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
            readPhotos: jest.fn(async items => ({ items, refused: [] })),
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

describe('useChatImageAttach — the panel in the keyboard’s place', () => {
    const recent = [
        { id: 'r1', src: 'data:r1' },
        { id: 'r2', src: 'data:r2' },
    ];
    const gridPicker = (over: Partial<PhotoPicker> = {}): PhotoPicker => ({
        ...unsupportedPicker(),
        supported: true,
        access: 'granted',
        recent,
        ...over,
    });
    const openButton = () => screen.getByRole('button', { name: 'chat.attach.open' });
    const panel = () => screen.getByRole('dialog', { name: 'chat.attach.menuTitle' });
    // Found while it slides away too, when it is inert and out of the accessibility tree's reach.
    const panelInPage = () =>
        document.querySelector<HTMLElement>('[role="dialog"][aria-label="chat.attach.menuTitle"]');
    /** How far below its place the panel is drawn, in % of its height, as the slot last wrote it. */
    const below = () => {
        const match = /^translateY\((-?[\d.e-]+)%\)$/.exec(panelInPage()?.style.transform ?? '');
        return match ? parseFloat(match[1]) : null;
    };
    const inject = (name: string, value: string) =>
        act(() => {
            document.documentElement.style.setProperty(name, value);
        });
    const flush = () => act(async () => undefined);
    beforeEach(() => {
        jest.useFakeTimers();
    });
    afterEach(() => {
        jest.useRealTimers();
    });

    it('opens under the composer, turns + into ×, and drops the keyboard', () => {
        render(<Harness sendImages={jest.fn()} picker={gridPicker()} />);
        const field = screen.getByRole('textbox', { name: 'composer' });
        field.focus();
        // Focusing it closed nothing: the panel was not open.
        expect(state()).toHaveAttribute('data-panel-open', 'false');

        fireEvent.click(openButton());

        expect(panel()).toHaveAttribute('data-state', 'open');
        expect(panel()).toHaveAttribute('aria-modal', 'false');
        expect(state()).toHaveAttribute('data-panel-open', 'true');
        expect(screen.getByRole('button', { name: 'chat.attach.close' })).toBeInTheDocument();
        expect(field).not.toHaveFocus();
    });

    it('takes the last keyboard’s height, and moves the composer up with its slide', () => {
        inject('--safe-bottom', '34px');
        inject('--keyboard-height', '336px');
        render(<Harness sendImages={jest.fn()} picker={gridPicker()} />);
        // The keyboard goes down; the panel still opens at its height.
        inject('--keyboard-height', '0px');

        fireEvent.click(openButton());

        // The body leaves out the safe area the panel adds below it: the whole is the keyboard's 336.
        expect(panel().style.height).toBe('calc(302px + var(--safe-bottom, 0px))');
        // No keyboard to stand in for: the panel rises from below, and the composer with it — moved by
        // the slot, frame by frame, with no transition of the panel's own.
        expect(panel()).toHaveClass('transition-none');
        expect(below()).toBe(100);
        expect(inset()).toBe(0);
        expect(composerSlides).toEqual([true]);
        act(() => jest.advanceTimersByTime(SLIDE_MS / 3));
        const midway = below() ?? 100;
        expect(midway).toBeGreaterThan(0);
        expect(midway).toBeLessThan(100);
        expect(inset()).toBeCloseTo((1 - midway / 100) * 336, 6);

        slideOver();

        // In place, told so, and the composer clear of all of it; the page stops following.
        expect(below()).toBe(0);
        expect(panel()).toHaveClass('translate-y-0');
        expect(inset()).toBe(336);
        expect(composerSlides).toEqual([true, false]);
    });

    it('takes the place of a keyboard that is up without moving the composer', () => {
        inject('--keyboard-height', '336px');
        render(<Harness sendImages={jest.fn()} picker={gridPicker()} />);
        const field = screen.getByRole('textbox', { name: 'composer' });
        act(() => field.focus());

        fireEvent.click(openButton());

        // As tall as the keyboard, in place at once: the composer stays where the keyboard held it.
        expect(panel()).toHaveClass('transition-none', 'translate-y-0');
        expect(below()).toBeNull();
        expect(inset()).toBe(336);
        expect(composerSlides).toEqual([]);
        expect(field).not.toHaveFocus();
    });

    it('× dismisses the panel and lets the pick go, the composer descending with it', () => {
        const picker = gridPicker({ picked: [recent[0]] });
        render(<Harness sendImages={jest.fn()} picker={picker} />);
        fireEvent.click(openButton());
        slideOver();
        const whole = inset();
        composerSlides = [];

        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.close' }));

        expect(state()).toHaveAttribute('data-panel-open', 'false');
        expect(picker.clearPicked).toHaveBeenCalledTimes(1);
        expect(openButton()).toBeInTheDocument();
        // Still in the page on its way down, the composer coming down with it.
        expect(panelInPage()).toHaveAttribute('data-state', 'closed');
        expect(composerSlides).toEqual([true]);
        act(() => jest.advanceTimersByTime(SLIDE_MS / 3));
        // The composer's edge and the panel's, drawn from the same position on the same frame.
        expect(inset()).toBeCloseTo((1 - (below() ?? 0) / 100) * whole, 6);

        slideOver();

        expect(inset()).toBe(0);
        expect(panelInPage()).not.toBeInTheDocument();
        expect(composerSlides).toEqual([true, false]);
    });

    // Android back reaches the page as Escape on the topmost open dialog, which the panel is.
    it('Escape dismisses the panel and lets the pick go, the composer descending with it', () => {
        const picker = gridPicker({ picked: [recent[0]] });
        render(<Harness sendImages={jest.fn()} picker={picker} />);
        fireEvent.click(openButton());

        fireEvent.keyDown(document, { key: 'Escape' });

        expect(state()).toHaveAttribute('data-panel-open', 'false');
        expect(picker.clearPicked).toHaveBeenCalledTimes(1);
        slideOver();
        expect(inset()).toBe(0);
        expect(panelInPage()).not.toBeInTheDocument();
    });

    it('lets the grid above it take Escape first', () => {
        const picker = gridPicker({ picked: [recent[0]] });
        const { rerender } = render(<Harness sendImages={jest.fn()} picker={picker} />);
        fireEvent.click(openButton());
        rerender(<Harness sendImages={jest.fn()} picker={{ ...picker, gridOpen: true }} />);

        fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape' });

        expect(picker.closeGrid).toHaveBeenCalledTimes(1);
        expect(picker.clearPicked).not.toHaveBeenCalled();
        expect(state()).toHaveAttribute('data-panel-open', 'true');
    });

    describe('in the app, when the field takes focus', () => {
        beforeEach(() => {
            mockNative = true;
            jest.useFakeTimers();
        });
        afterEach(() => {
            mockNative = false;
            jest.useRealTimers();
        });
        const focusField = () => act(() => screen.getByRole('textbox', { name: 'composer' }).focus());

        it('keeps the pick, and the panel in place holding the composer up until the keyboard covers it', async () => {
            inject('--keyboard-height', '320px');
            inject('--keyboard-height', '0px');
            const picker = gridPicker({ picked: [recent[0]] });
            render(<Harness sendImages={jest.fn()} picker={picker} />);
            fireEvent.click(openButton());
            slideOver();
            const held = inset();
            composerSlides = [];

            focusField();

            expect(state()).toHaveAttribute('data-panel-open', 'false');
            expect(picker.clearPicked).not.toHaveBeenCalled();
            // Still there under the rising keyboard, and still holding the composer where it was.
            expect(panel()).toHaveAttribute('data-state', 'open');
            expect(inset()).toBe(held);
            await act(async () => {
                document.documentElement.style.setProperty('--keyboard-height', '320px');
            });
            act(() => jest.advanceTimersByTime(KEYBOARD_COVER_MS));

            // Covered: gone at once, nothing sliding, the composer on the keyboard's height from here.
            expect(inset()).toBe(0);
            expect(composerSlides).toEqual([]);
            expect(panelInPage()).not.toBeInTheDocument();
        });

        it('slides the panel down with the composer when no keyboard comes', () => {
            render(<Harness sendImages={jest.fn()} picker={gridPicker()} />);
            fireEvent.click(openButton());
            slideOver();
            focusField();
            expect(inset()).not.toBe(0);

            act(() => jest.advanceTimersByTime(KEYBOARD_WAIT_MS));

            expect(composerSlides).toEqual([true, false, true]);
            slideOver();
            expect(inset()).toBe(0);
            expect(panelInPage()).not.toBeInTheDocument();
        });
    });

    it('slides the panel down with the composer at once when the field takes focus in a browser', () => {
        const picker = gridPicker({ picked: [recent[0]] });
        render(<Harness sendImages={jest.fn()} picker={picker} />);
        fireEvent.click(openButton());
        slideOver();
        composerSlides = [];

        act(() => screen.getByRole('textbox', { name: 'composer' }).focus());

        expect(state()).toHaveAttribute('data-panel-open', 'false');
        expect(composerSlides).toEqual([true]);
        slideOver();
        expect(inset()).toBe(0);
        expect(picker.clearPicked).not.toHaveBeenCalled();
    });

    it('closes when the composer locks, rather than coming back when it unlocks', () => {
        const picker = gridPicker();
        const { rerender } = render(<Harness sendImages={jest.fn()} picker={picker} />);
        fireEvent.click(openButton());

        rerender(<Harness sendImages={jest.fn()} picker={picker} disabled />);
        expect(state()).toHaveAttribute('data-panel-open', 'false');
        slideOver();
        expect(inset()).toBe(0);
        rerender(<Harness sendImages={jest.fn()} picker={picker} />);

        expect(state()).toHaveAttribute('data-panel-open', 'false');
    });

    it('opens the camera and the files sheet as before, closing the panel and keeping its pick', () => {
        const picker = gridPicker({ picked: [recent[0]] });
        render(<Harness sendImages={jest.fn()} picker={picker} />);
        const camera = jest.spyOn(screen.getByTestId('chat-attach-camera') as HTMLInputElement, 'click');

        fireEvent.click(openButton());
        slideOver();
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.camera' }));
        expect(camera).toHaveBeenCalledTimes(1);
        expect(state()).toHaveAttribute('data-panel-open', 'false');
        // Down with the composer, as for ×.
        expect(composerSlides).toEqual([true, false, true]);
        slideOver();

        fireEvent.click(openButton());
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.file' }));
        expect(screen.getByRole('button', { name: 'chat.attach.source.album' })).toBeInTheDocument();
        expect(state()).toHaveAttribute('data-panel-open', 'false');
        expect(picker.clearPicked).not.toHaveBeenCalled();
    });

    it('readies the composer’s send whenever something is picked, the panel open or closed', () => {
        const picked = { picked: [recent[0]] };
        const { rerender } = render(<Harness sendImages={jest.fn()} picker={gridPicker(picked)} />);
        const ready = () => screen.getByTestId('composer-send').getAttribute('data-ready');
        // Closed: the pick waits above the field, and the button is still its.
        expect(ready()).toBe('true');

        fireEvent.click(openButton());
        expect(ready()).toBe('true');
        act(() => screen.getByRole('textbox', { name: 'composer' }).focus());
        expect(state()).toHaveAttribute('data-panel-open', 'false');
        expect(ready()).toBe('true');

        rerender(<Harness sendImages={jest.fn()} picker={gridPicker()} />);
        expect(ready()).toBe('false');
        // On its way already: the press that sent it has nothing left to send.
        rerender(<Harness sendImages={jest.fn()} picker={gridPicker({ ...picked, preparing: true })} />);
        expect(ready()).toBe('false');
        // The composer's lock: its button is not the pick's to use.
        rerender(<Harness sendImages={jest.fn()} picker={gridPicker(picked)} disabled />);
        expect(ready()).toBe('false');
    });

    it('sends the pick with the typed text as its caption, as one message, and closes the panel', async () => {
        const sendImages = jest.fn().mockResolvedValue(undefined);
        const picker = gridPicker({
            picked: [recent[1], recent[0]],
            takePicked: jest.fn().mockResolvedValue({
                items: [photo('r2.jpg', 'image/jpeg', 2), photo('r1.jpg', 'image/jpeg', 1)],
                refused: [],
            }),
        });
        render(<Harness sendImages={sendImages} picker={picker} caption="  look at these  " />);
        fireEvent.click(openButton());

        fireEvent.click(screen.getByTestId('composer-send'));
        await flush();

        expect(sentPicked).toBe(true);
        expect(state()).toHaveAttribute('data-panel-open', 'false');
        expect(sendImages.mock.calls[0][0].map((f: File) => f.name)).toEqual(['r2.jpg', 'r1.jpg']);
        expect(sendImages.mock.calls[0][1]).toEqual({ content: 'look at these' });
        expect(picker.clearPicked).not.toHaveBeenCalled();
    });

    it('sends the pick as one message each with the caption while grouping is off', async () => {
        mockGrouped = false;
        const sendImages = jest.fn().mockResolvedValue(undefined);
        const picker = gridPicker({
            picked: recent,
            takePicked: jest.fn().mockResolvedValue({
                items: [photo('r1.jpg', 'image/jpeg', 1), photo('r2.jpg', 'image/jpeg', 2)],
                refused: [],
            }),
        });
        render(<Harness sendImages={sendImages} picker={picker} caption="hi" />);
        fireEvent.click(openButton());

        fireEvent.click(screen.getByTestId('composer-send'));
        await flush();

        expect(sendImages.mock.calls[0][1]).toEqual({ separately: true, content: 'hi' });
    });

    it('sends the pick alone when nothing is typed', async () => {
        const sendImages = jest.fn().mockResolvedValue(undefined);
        const picker = gridPicker({
            picked: [recent[0]],
            takePicked: jest.fn().mockResolvedValue({ items: [photo('r1.jpg')], refused: [] }),
        });
        render(<Harness sendImages={sendImages} picker={picker} caption="   " />);
        fireEvent.click(openButton());

        fireEvent.click(screen.getByTestId('composer-send'));
        await flush();

        expect(sendImages.mock.calls[0]).toHaveLength(1);
    });

    it('answers false and sends nothing when nothing is picked, so the page sends its text', () => {
        const picker = gridPicker();
        render(<Harness sendImages={jest.fn()} picker={picker} caption="hi" />);
        fireEvent.click(openButton());

        fireEvent.click(screen.getByTestId('composer-send'));

        expect(sentPicked).toBe(false);
        expect(picker.takePicked).not.toHaveBeenCalled();
        expect(state()).toHaveAttribute('data-panel-open', 'true');
    });

    it('hands the caption back when nothing in the pick could be sent', async () => {
        const sendImages = jest.fn().mockResolvedValue(undefined);
        const onUnsentText = jest.fn();
        const picker = gridPicker({
            picked: [recent[0]],
            takePicked: jest.fn().mockResolvedValue({ items: [photo('r1.heic', 'image/heic')], refused: [] }),
        });
        render(<Harness sendImages={sendImages} picker={picker} caption="hi" onUnsentText={onUnsentText} />);
        fireEvent.click(openButton());

        fireEvent.click(screen.getByTestId('composer-send'));
        await flush();

        expect(sendImages).not.toHaveBeenCalled();
        expect(onUnsentText).toHaveBeenCalledWith('hi');
        expect(toast.mock.calls[0][0].title).toContain('chat.attach.rejected.unsupported');
    });

    it('closes the panel when the grid sends, and leaves the typed text out', async () => {
        const sendImages = jest.fn().mockResolvedValue(undefined);
        const picker = gridPicker({
            picked: [recent[0]],
            takePicked: jest.fn().mockResolvedValue({ items: [photo('r1.jpg')], refused: [] }),
        });
        const { rerender } = render(<Harness sendImages={sendImages} picker={picker} caption="hi" />);
        fireEvent.click(openButton());
        rerender(<Harness sendImages={sendImages} picker={{ ...picker, gridOpen: true }} caption="hi" />);

        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.send:{"count":1}' }));
        await flush();

        expect(state()).toHaveAttribute('data-panel-open', 'false');
        expect(sendImages.mock.calls[0]).toHaveLength(1);
    });

    it('closes the grid back onto the panel, with the pick kept', () => {
        const picker = gridPicker({ picked: [recent[0]] });
        const { rerender } = render(<Harness sendImages={jest.fn()} picker={picker} />);
        fireEvent.click(openButton());
        rerender(<Harness sendImages={jest.fn()} picker={{ ...picker, gridOpen: true }} />);

        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.viewerClose' }));

        expect(picker.closeGrid).toHaveBeenCalledTimes(1);
        expect(picker.clearPicked).not.toHaveBeenCalled();
        expect(state()).toHaveAttribute('data-panel-open', 'true');
    });

    it('closes the panel too when the grid’s camera opens', () => {
        // A grid with a size, so it lays out its first cells — the camera tile is the first.
        const width = jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(390);
        const height = jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(700);
        try {
            const picker = gridPicker({ count: 1, photoAt: (index: number) => recent[index] });
            const { rerender } = render(<Harness sendImages={jest.fn()} picker={picker} />);
            fireEvent.click(openButton());
            rerender(<Harness sendImages={jest.fn()} picker={{ ...picker, gridOpen: true }} />);

            fireEvent.click(screen.getByRole('button', { name: 'chat.attach.camera' }));

            expect(picker.closeGrid).toHaveBeenCalledTimes(1);
            expect(state()).toHaveAttribute('data-panel-open', 'false');
        } finally {
            width.mockRestore();
            height.mockRestore();
        }
    });
});

describe('useChatImageAttach — the recent row while the app is asked for its library', () => {
    const recent = [
        { id: 'r1', src: 'data:r1' },
        { id: 'r2', src: 'data:r2' },
    ];
    const openButton = () => screen.getByRole('button', { name: 'chat.attach.open' });
    const row = () => document.querySelector<HTMLElement>('[data-recent-strip]');
    const placeholders = () => document.querySelectorAll('[data-recent-placeholder]');
    /** A picker whose library has not been asked yet, and a way to answer the probe the panel sends. */
    const unasked = () => {
        let answer: () => void = () => undefined;
        const probe = jest.fn(
            () =>
                new Promise<void>(resolve => {
                    answer = resolve;
                })
        );
        const picker: PhotoPicker = { ...unsupportedPicker(), supported: null, probe };
        return { picker, answer: () => act(async () => answer()) };
    };
    beforeEach(() => {
        mockNative = true;
        jest.useFakeTimers();
    });
    afterEach(() => {
        mockNative = false;
        jest.useRealTimers();
    });

    it('stands in skeleton tiles from the panel’s first frame, and fills in where it stands', async () => {
        const { picker, answer } = unasked();
        const { rerender } = render(<Harness sendImages={jest.fn()} picker={picker} />);

        fireEvent.click(openButton());

        // There before the answer, at its full size, so the entries under it start where they stay.
        const standing = row();
        expect(standing).toBeInTheDocument();
        expect(placeholders().length).toBeGreaterThan(0);
        // The answer, as the picker renders it: the library is there, with its newest items.
        rerender(<Harness sendImages={jest.fn()} picker={{ ...picker, supported: true, access: 'granted', recent }} />);
        await answer();

        expect(row()).toBe(standing);
        expect(standing).not.toHaveAttribute('inert');
        expect(placeholders()).toHaveLength(0);
        expect(screen.getByRole('button', { name: 'chat.attach.recentPhoto:{"position":2}' })).toBeInTheDocument();
    });

    it('closes the row when the app turns out to have no library', async () => {
        const { picker, answer } = unasked();
        const { rerender } = render(<Harness sendImages={jest.fn()} picker={picker} />);
        fireEvent.click(openButton());
        expect(row()).toBeInTheDocument();

        rerender(<Harness sendImages={jest.fn()} picker={{ ...picker, supported: false }} />);
        await answer();

        // Closing rather than cut out: still there while its height goes, and out of reach meanwhile.
        expect(row()).toHaveAttribute('inert');
        act(() => jest.advanceTimersByTime(SLIDE_MS + 100));
        expect(row()).not.toBeInTheDocument();
    });

    it('stops waiting once a probe has come back with no answer, closing the row for this time', async () => {
        const { picker, answer } = unasked();
        render(<Harness sendImages={jest.fn()} picker={picker} />);
        fireEvent.click(openButton());

        // A transient failure: the probe is over, and whether there is a library is still not known.
        await answer();

        expect(row()).toHaveAttribute('inert');
        act(() => jest.advanceTimersByTime(SLIDE_MS + 100));
        expect(row()).not.toBeInTheDocument();
    });

    it('draws no row in a browser, which never has a library', () => {
        mockNative = false;
        const { picker } = unasked();
        render(<Harness sendImages={jest.fn()} picker={picker} />);

        fireEvent.click(openButton());

        expect(row()).not.toBeInTheDocument();
    });
});

describe('useChatImageAttach — the pick above the composer', () => {
    const recent = [
        { id: 'r1', src: 'data:r1' },
        { id: 'r2', src: 'data:r2', kind: 'video' as const, durationMs: 2000 },
    ];
    const gridPicker = (over: Partial<PhotoPicker> = {}): PhotoPicker => ({
        ...unsupportedPicker(),
        supported: true,
        access: 'granted',
        recent,
        ...over,
    });
    const openButton = () => screen.getByRole('button', { name: 'chat.attach.open' });
    const field = () => screen.getByRole('textbox', { name: 'composer' });
    const row = () => screen.queryByRole('group', { name: 'chat.attach.pickedTitle' });
    const thumb = (position: number) =>
        screen.getByRole('button', { name: `chat.attach.edit.select:${JSON.stringify({ position })}` });
    const ready = () => screen.getByTestId('composer-send').getAttribute('data-ready');
    const editor = () => screen.getByRole('dialog', { name: 'chat.attach.edit.title' });
    const queryEditor = () => screen.queryByRole('dialog', { name: 'chat.attach.edit.title' });
    const flush = () => act(async () => undefined);

    it('keeps the pick on screen above the field once the panel closes for the keyboard, with send still live', () => {
        const picker = gridPicker({ picked: recent });
        render(<Harness sendImages={jest.fn()} picker={picker} />);
        fireEvent.click(openButton());
        // While the panel is open, its recent row is where the pick shows.
        expect(row()).not.toBeInTheDocument();

        act(() => field().focus());

        expect(state()).toHaveAttribute('data-panel-open', 'false');
        expect(row()).toBeInTheDocument();
        expect(
            within(row() as HTMLElement).getAllByRole('button', { name: /chat\.attach\.edit\.select/ })
        ).toHaveLength(2);
        // A video keeps its play mark.
        expect(thumb(2).querySelector('[data-video-mark]')).toBeInTheDocument();
        expect(ready()).toBe('true');
        expect(picker.clearPicked).not.toHaveBeenCalled();
    });

    it('shows the pick above the composer while the panel is open, when some of it is not in the recent row', () => {
        // Picked in the grid, past the newest items the panel's row offers.
        const older = { id: 'g40', src: 'data:g40' };
        render(<Harness sendImages={jest.fn()} picker={gridPicker({ picked: [recent[0], older] })} />);

        fireEvent.click(openButton());

        // The row cannot show all of it, so the composer does — the whole pick, in pick order.
        expect(state()).toHaveAttribute('data-panel-open', 'true');
        expect(
            within(row() as HTMLElement).getAllByRole('button', { name: /chat\.attach\.edit\.select/ })
        ).toHaveLength(2);
        expect(ready()).toBe('true');
    });

    it('shows the pick above the composer while the open panel draws no recent row to show it in', () => {
        render(<Harness sendImages={jest.fn()} picker={gridPicker({ picked: [recent[0]], access: 'denied' })} />);

        fireEvent.click(openButton());

        expect(state()).toHaveAttribute('data-panel-open', 'true');
        expect(row()).toBeInTheDocument();
    });

    // The row folds itself away as it empties, which takes it staying mounted: the panel opening over
    // the pick hands it an empty pick rather than taking it out of the composer.
    it('keeps the row in the composer as it empties, folding the gap above the field with it', () => {
        const picker = gridPicker({ picked: recent });
        render(<Harness sendImages={jest.fn()} picker={picker} />);
        const holder = screen.getByTestId('strip-slot').firstElementChild as HTMLElement;
        const strip = () => holder.querySelector('[data-picked-strip]');
        const shown = strip();
        expect(shown).toBeInTheDocument();
        // The 8px above the field is the row's own margin, inside the part that opens and closes. On
        // the wrapper it would fold on a timing of its own, or stay behind once the row had gone.
        expect(row()).toHaveClass('mb-2');
        expect(holder.className).not.toMatch(/(^|\s)p[by]?-/);

        fireEvent.click(openButton());

        // The same row, on its way out: drawn while it closes, but out of reach and unread.
        expect(strip()).toBe(shown);
        expect(shown).toHaveAttribute('inert');
        expect(row()).not.toBeInTheDocument();
    });

    it('gives the composer no row where there is no in-app pick', () => {
        render(<Harness sendImages={jest.fn()} />);

        expect(screen.getByTestId('strip-slot')).toBeEmptyDOMElement();
    });

    it('shows no row while nothing is picked, or while the composer is locked', () => {
        const { rerender } = render(<Harness sendImages={jest.fn()} picker={gridPicker()} />);
        expect(row()).not.toBeInTheDocument();

        rerender(<Harness sendImages={jest.fn()} picker={gridPicker({ picked: recent })} disabled />);

        expect(row()).not.toBeInTheDocument();
    });

    it('sends the pick from above the field with the typed text as its caption, as one message', async () => {
        const sendImages = jest.fn().mockResolvedValue(undefined);
        const picker = gridPicker({
            picked: recent,
            takePicked: jest.fn().mockResolvedValue({ items: [photo('r1.jpg')], refused: [] }),
        });
        render(<Harness sendImages={sendImages} picker={picker} caption=" for you " />);
        expect(state()).toHaveAttribute('data-panel-open', 'false');

        fireEvent.click(screen.getByTestId('composer-send'));
        await flush();

        expect(sentPicked).toBe(true);
        expect(picker.takePicked).toHaveBeenCalledTimes(1);
        expect(sendImages).toHaveBeenCalledTimes(1);
        expect(sendImages.mock.calls[0][1]).toEqual({ content: 'for you' });
        expect(state()).toHaveAttribute('data-panel-open', 'false');
    });

    it('unpicks a photo with its ×, and leaves the send to the text once the last one has gone', () => {
        const picker = gridPicker({ picked: recent });
        const { rerender } = render(<Harness sendImages={jest.fn()} picker={picker} />);

        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.removePicked:{"position":2}' }));

        expect(picker.toggle).toHaveBeenCalledWith(recent[1]);
        // The picker has let both go.
        rerender(<Harness sendImages={jest.fn()} picker={{ ...picker, picked: [] }} />);
        expect(row()).not.toBeInTheDocument();
        expect(ready()).toBe('false');
    });

    it('keeps the field’s caret through a tap on the row, so removing a photo leaves the keyboard up', () => {
        render(<Harness sendImages={jest.fn()} picker={gridPicker({ picked: recent })} />);
        const remove = screen.getByRole('button', { name: 'chat.attach.removePicked:{"position":1}' });

        // `false`: the press's default — moving focus off the field — was cancelled.
        expect(fireEvent.pointerDown(remove)).toBe(false);
        expect(fireEvent.mouseDown(remove)).toBe(false);
    });

    it('opens the editor at a tapped thumbnail with no grid under it, dropping the keyboard', () => {
        const picker = gridPicker({ picked: [{ id: 'p1', src: 'data:p1' }, recent[0], { id: 'p3', src: 'data:p3' }] });
        render(<Harness sendImages={jest.fn()} picker={picker} />);
        // Held before the editor opens: a modal hides the page behind it from queries by role.
        const input = field();
        act(() => input.focus());

        fireEvent.click(thumb(2));

        expect(editor()).toBeInTheDocument();
        expect(within(editor()).getByText('chat.attach.edit.counter:{"position":2,"total":3}')).toBeInTheDocument();
        expect(picker.loadForEdit).toHaveBeenLastCalledWith('r1', 'p3', 'p1');
        expect(input).not.toHaveFocus();
        expect(picker.openGrid).not.toHaveBeenCalled();
    });

    it('closes the editor back onto the composer with "완료", and lets the bytes it read go', () => {
        const picker = gridPicker({ picked: recent });
        render(<Harness sendImages={jest.fn()} picker={picker} />);
        const input = field();
        act(() => input.focus());
        fireEvent.click(thumb(1));

        fireEvent.click(within(editor()).getByRole('button', { name: 'chat.attach.edit.done' }));

        expect(queryEditor()).not.toBeInTheDocument();
        expect(picker.releaseBytes).toHaveBeenCalledTimes(1);
        expect(row()).toBeInTheDocument();
        // The editor took the caret as it opened and hands it back to nothing: the keyboard, dropped
        // for the editor, does not spring back up over the composer.
        expect(input).not.toHaveFocus();
    });

    it('lets the bytes go when ✕ leaves the editor over the composer, after asking when there were edits', () => {
        const turned: PhotoEdit = { ...IDENTITY_PHOTO_EDIT, rotation: 90 };
        const picker = gridPicker({ picked: recent });
        const { rerender } = render(<Harness sendImages={jest.fn()} picker={picker} />);
        fireEvent.click(thumb(1));
        rerender(<Harness sendImages={jest.fn()} picker={{ ...picker, edits: new Map([['r1', turned]]) }} />);

        fireEvent.click(within(editor()).getByRole('button', { name: 'chat.attach.edit.close' }));
        expect(picker.releaseBytes).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.edit.discard.confirm' }));

        expect(picker.restoreEdits).toHaveBeenCalledWith(new Map());
        expect(picker.releaseBytes).toHaveBeenCalledTimes(1);
        expect(queryEditor()).not.toBeInTheDocument();
    });

    it('sends from an editor opened over the composer without the caption, keeping the bytes for the send', async () => {
        const sendImages = jest.fn().mockResolvedValue(undefined);
        const picker = gridPicker({
            picked: recent,
            takePicked: jest.fn().mockResolvedValue({ items: [photo('r1.jpg')], refused: [] }),
        });
        render(<Harness sendImages={sendImages} picker={picker} caption="stays in the field" />);
        fireEvent.click(thumb(1));

        fireEvent.click(within(editor()).getByRole('button', { name: 'chat.attach.send:{"count":2}' }));
        await flush();

        expect(queryEditor()).not.toBeInTheDocument();
        expect(sendImages.mock.calls[0]).toHaveLength(1);
        expect(picker.releaseBytes).not.toHaveBeenCalled();
    });

    it('fades the row and opens nothing from it while the send reads the pick', () => {
        const picker = gridPicker({ picked: recent, preparing: true });
        render(<Harness sendImages={jest.fn()} picker={picker} />);

        expect((row() as HTMLElement).closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true');
        fireEvent.click(thumb(1));

        expect(queryEditor()).not.toBeInTheDocument();
    });
});

describe('useChatImageAttach — files waiting above the composer', () => {
    const recent = [
        { id: 'r1', src: 'data:r1' },
        { id: 'r2', src: 'data:r2' },
    ];
    const gridPicker = (over: Partial<PhotoPicker> = {}): PhotoPicker => ({
        ...unsupportedPicker(),
        supported: true,
        access: 'granted',
        recent,
        ...over,
    });
    const shellPicker = (answer: () => Promise<AttachmentPick | null>): AttachmentPicker => ({
        pick: jest.fn(answer),
        readPhotos: jest.fn(async items => ({ items, refused: [] })),
        prepareVideo: jest.fn(),
        isUnsupported: () => false,
        reset: jest.fn(),
    });
    const shellDoc = {
        uri: 'file:///c/attach-pick/a/plan.pdf',
        name: 'plan.pdf',
        type: 'application/pdf',
        size: 2048,
        kind: 'file' as const,
    };
    const openSource = (name: 'chat.attach.source.album' | 'chat.attach.source.files') => {
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.open' }));
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.file' }));
        fireEvent.click(screen.getByRole('button', { name }));
    };
    const files = () => screen.queryByRole('group', { name: 'chat.attach.pickedFiles' });
    const chips = () => within(files() as HTMLElement).getAllByRole('listitem');
    const ready = () => screen.getByTestId('composer-send').getAttribute('data-ready');
    const shellPhoto = {
        uri: 'file:///c/attach-pick/b/shot.png',
        name: 'shot.png',
        type: 'image/png',
        size: 4096,
        kind: 'file' as const,
    };
    const doc = (name: string, lastModified = 1) => photo(name, 'application/pdf', lastModified);
    const flush = () => act(async () => undefined);

    it('keeps a pick from the files input above the field instead of sending it, and readies the send', () => {
        const sendImages = jest.fn().mockResolvedValue(undefined);
        render(<Harness sendImages={sendImages} />);
        expect(screen.getByTestId('strip-slot')).toBeEmptyDOMElement();

        pick('chat-attach-files', [doc('a.pdf', 1), doc('b.pdf', 2)]);

        expect(sendImages).not.toHaveBeenCalled();
        expect(chips().map(chip => chip.textContent)).toEqual([
            expect.stringContaining('a.pdf'),
            expect.stringContaining('b.pdf'),
        ]);
        expect(ready()).toBe('true');
    });

    it('sends the waiting files with the typed text as one message, and clears the row', async () => {
        const sendImages = jest.fn().mockResolvedValue(undefined);
        render(<Harness sendImages={sendImages} caption=" the plan " />);
        pick('chat-attach-files', [doc('a.pdf', 1), doc('b.pdf', 2)]);

        fireEvent.click(screen.getByTestId('composer-send'));
        await flush();

        expect(sentPicked).toBe(true);
        expect(sendImages).toHaveBeenCalledTimes(1);
        expect(sendImages.mock.calls[0][0].map((f: File) => f.name)).toEqual(['a.pdf', 'b.pdf']);
        expect(sendImages.mock.calls[0][1]).toEqual({ content: 'the plan' });
        expect(files()).not.toBeInTheDocument();
        expect(ready()).toBe('false');
    });

    it('keeps what the app’s files picker gives above the field, and still sends the album’s at once', async () => {
        const sendImages = jest.fn().mockResolvedValue(undefined);
        const shell = shellPicker(async () => ({ items: [shellDoc], refused: [] }));
        render(<Harness sendImages={sendImages} shellPicker={shell} />);

        openSource('chat.attach.source.files');
        await flush();

        expect(shell.pick).toHaveBeenCalledWith({ source: 'document', selectionLimit: 10 });
        expect(sendImages).not.toHaveBeenCalled();
        expect(chips()).toHaveLength(1);

        openSource('chat.attach.source.album');
        await flush();

        expect(sendImages).toHaveBeenCalledTimes(1);
        expect(sendImages.mock.calls[0][0]).toEqual([shellDoc]);
        // The album's pick went alone; the waiting file is still the send button's.
        expect(chips()).toHaveLength(1);
    });

    it('removes a file with its ×, and leaves the send to the text once the last one has gone', () => {
        render(<Harness sendImages={jest.fn()} />);
        pick('chat-attach-files', [doc('a.pdf', 1), doc('b.pdf', 2)]);

        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.removeFile:{"name":"a.pdf"}' }));
        expect(chips()).toHaveLength(1);

        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.removeFile:{"name":"b.pdf"}' }));
        expect(files()).not.toBeInTheDocument();
        expect(ready()).toBe('false');
    });

    it('keeps the waiting files when the panel is dismissed, while the pick goes', () => {
        const picker = gridPicker({ picked: [recent[0]] });
        render(<Harness sendImages={jest.fn()} picker={picker} />);
        pick('chat-attach-files', [doc('a.pdf')]);

        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.open' }));
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.close' }));

        expect(picker.clearPicked).toHaveBeenCalledTimes(1);
        expect(chips()).toHaveLength(1);
    });

    it('sends the in-app pick and the waiting files as one message with the caption, whatever the grouping', async () => {
        mockGrouped = false;
        const sendImages = jest.fn().mockResolvedValue(undefined);
        const picker = gridPicker({
            picked: recent,
            takePicked: jest.fn().mockResolvedValue({ items: [photo('r1.jpg', 'image/jpeg', 7)], refused: [] }),
        });
        render(<Harness sendImages={sendImages} picker={picker} caption="look" />);
        pick('chat-attach-files', [doc('a.pdf')]);

        fireEvent.click(screen.getByTestId('composer-send'));
        await flush();

        expect(picker.takePicked).toHaveBeenCalledTimes(1);
        expect(sendImages).toHaveBeenCalledTimes(1);
        expect(sendImages.mock.calls[0][0].map((f: File) => f.name)).toEqual(['r1.jpg', 'a.pdf']);
        expect(sendImages.mock.calls[0][1]).toEqual({ content: 'look' });
        expect(files()).not.toBeInTheDocument();
    });

    it('keeps the files and hands the caption back when the in-app pick cannot be read', async () => {
        const sendImages = jest.fn();
        const onUnsentText = jest.fn();
        const picker = gridPicker({ picked: recent, takePicked: jest.fn().mockRejectedValue(new Error('read')) });
        render(<Harness sendImages={sendImages} picker={picker} caption="look" onUnsentText={onUnsentText} />);
        pick('chat-attach-files', [doc('a.pdf')]);

        fireEvent.click(screen.getByTestId('composer-send'));
        await flush();

        expect(sendImages).not.toHaveBeenCalled();
        expect(toast).toHaveBeenCalledWith({ title: 'chat.attach.sendFailed', variant: 'destructive' });
        expect(onUnsentText).toHaveBeenCalledWith('look');
        expect(chips()).toHaveLength(1);
    });

    it('counts the in-app pick against the per-message limit, and names it for what is over', () => {
        const picked = Array.from({ length: 9 }, (_, i) => ({ id: `g${i}`, src: `data:g${i}` }));
        render(<Harness sendImages={jest.fn()} picker={gridPicker({ picked })} />);

        pick('chat-attach-files', [doc('a.pdf', 1), doc('b.pdf', 2)]);

        expect(chips()).toHaveLength(1);
        expect(toast).toHaveBeenCalledTimes(1);
        expect(toast.mock.calls[0][0].title).toBe('chat.attach.rejected.limit:{"max":10}');
    });

    it('counts the files already waiting against the limit, across picks', () => {
        render(<Harness sendImages={jest.fn()} />);
        pick(
            'chat-attach-files',
            Array.from({ length: 8 }, (_, i) => doc(`d${i}.pdf`, i))
        );

        pick('chat-attach-files', [doc('x.pdf', 100), doc('y.pdf', 101), doc('z.pdf', 102)]);

        expect(chips()).toHaveLength(10);
        expect(toast.mock.calls[0][0].title).toBe('chat.attach.rejected.limit:{"max":10}');
    });

    it('refuses a file already waiting as the same item picked twice', () => {
        render(<Harness sendImages={jest.fn()} />);
        pick('chat-attach-files', [doc('a.pdf', 1)]);

        pick('chat-attach-files', [doc('a.pdf', 1)]);

        expect(chips()).toHaveLength(1);
        expect(toast.mock.calls[0][0].title).toContain('chat.attach.rejected.duplicate');
    });

    it('asks the app’s files picker for the room left, and not at all once there is none', async () => {
        const shell = shellPicker(async () => ({ items: [], refused: [] }));
        const picked = Array.from({ length: 7 }, (_, i) => ({ id: `g${i}`, src: `data:g${i}` }));
        const { rerender } = render(
            <Harness sendImages={jest.fn()} picker={gridPicker({ picked })} shellPicker={shell} />
        );

        openSource('chat.attach.source.files');
        await flush();
        expect(shell.pick).toHaveBeenCalledWith({ source: 'document', selectionLimit: 3 });

        const full = Array.from({ length: 10 }, (_, i) => ({ id: `g${i}`, src: `data:g${i}` }));
        rerender(<Harness sendImages={jest.fn()} picker={gridPicker({ picked: full })} shellPicker={shell} />);
        openSource('chat.attach.source.files');
        await flush();

        expect(shell.pick).toHaveBeenCalledTimes(1);
        expect(toast).toHaveBeenCalledWith({ title: 'chat.attach.rejected.limit:{"max":10}' });
    });

    it('locks the recent row once the waiting files and the pick together reach the limit', () => {
        const picked = Array.from({ length: 8 }, (_, i) => ({ id: i === 0 ? 'r1' : `g${i}`, src: `data:g${i}` }));
        render(<Harness sendImages={jest.fn()} picker={gridPicker({ picked })} />);
        pick('chat-attach-files', [doc('a.pdf', 1), doc('b.pdf', 2)]);

        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.open' }));

        expect(screen.getByRole('button', { name: 'chat.attach.recentPhoto:{"position":2}' })).toBeDisabled();
    });

    it('hides the waiting files and holds the send while the composer is locked', () => {
        const { rerender } = render(<Harness sendImages={jest.fn()} />);
        pick('chat-attach-files', [doc('a.pdf')]);

        rerender(<Harness sendImages={jest.fn()} disabled />);

        expect(files()).not.toBeInTheDocument();
        expect(ready()).toBe('false');

        rerender(<Harness sendImages={jest.fn()} />);
        expect(chips()).toHaveLength(1);
    });

    it('keeps a photo from the app’s files picker in the shell while it waits, and reads it at the send', async () => {
        const sendImages = jest.fn().mockResolvedValue(undefined);
        const read = photo('shot.png', 'image/png', 9);
        const shell = shellPicker(async () => ({ items: [shellPhoto, shellDoc], refused: [] }));
        shell.readPhotos = jest.fn(async items => ({
            items: items.map(item => (item === shellPhoto ? read : item)),
            refused: [],
        }));
        render(<Harness sendImages={sendImages} shellPicker={shell} caption="both" />);

        openSource('chat.attach.source.files');
        await flush();
        expect(chips()).toHaveLength(2);
        expect(shell.readPhotos).not.toHaveBeenCalled();

        fireEvent.click(screen.getByTestId('composer-send'));
        await flush();

        expect(shell.readPhotos).toHaveBeenCalledWith([shellPhoto, shellDoc]);
        expect(sendImages).toHaveBeenCalledTimes(1);
        expect(sendImages.mock.calls[0][0]).toEqual([read, shellDoc]);
        expect(sendImages.mock.calls[0][1]).toEqual({ content: 'both' });
        expect(files()).not.toBeInTheDocument();
    });

    it('names a waiting photo that cannot be read at the send, and sends the rest', async () => {
        const sendImages = jest.fn().mockResolvedValue(undefined);
        const shell = shellPicker(async () => ({ items: [shellPhoto, shellDoc], refused: [] }));
        shell.readPhotos = jest.fn(async () => ({
            items: [shellDoc],
            refused: [{ name: 'shot.png', kind: 'image' as const, reason: 'unreadable' as const }],
        }));
        render(<Harness sendImages={sendImages} shellPicker={shell} />);
        openSource('chat.attach.source.files');
        await flush();

        fireEvent.click(screen.getByTestId('composer-send'));
        await flush();

        expect(sendImages.mock.calls[0][0]).toEqual([shellDoc]);
        expect(toast).toHaveBeenCalledTimes(1);
        expect(toast.mock.calls[0][0].title).toContain('chat.attach.rejected.unreadable');
        expect(files()).not.toBeInTheDocument();
    });

    it('reads the waiting photos before the in-app pick, and sends them together after it', async () => {
        const sendImages = jest.fn().mockResolvedValue(undefined);
        const order: string[] = [];
        const read = photo('shot.png', 'image/png', 9);
        const shell = shellPicker(async () => ({ items: [shellPhoto], refused: [] }));
        shell.readPhotos = jest.fn(async () => {
            order.push('held');
            return { items: [read], refused: [] };
        });
        const picker = gridPicker({
            picked: recent,
            takePicked: jest.fn(async () => {
                order.push('pick');
                return { items: [photo('r1.jpg', 'image/jpeg', 7)], refused: [] };
            }),
        });
        render(<Harness sendImages={sendImages} picker={picker} shellPicker={shell} />);
        openSource('chat.attach.source.files');
        await flush();

        fireEvent.click(screen.getByTestId('composer-send'));
        await flush();

        expect(order).toEqual(['held', 'pick']);
        expect(sendImages.mock.calls[0][0].map((f: File) => f.name)).toEqual(['r1.jpg', 'shot.png']);
    });

    it('keeps the files, the in-app pick and the caption when the waiting photos cannot be read at all', async () => {
        const sendImages = jest.fn();
        const onUnsentText = jest.fn();
        const shell = shellPicker(async () => ({ items: [shellPhoto], refused: [] }));
        shell.readPhotos = jest.fn().mockRejectedValue(new Error('bridge'));
        const picker = gridPicker({ picked: recent });
        render(
            <Harness
                sendImages={sendImages}
                picker={picker}
                shellPicker={shell}
                caption="look"
                onUnsentText={onUnsentText}
            />
        );
        openSource('chat.attach.source.files');
        await flush();

        fireEvent.click(screen.getByTestId('composer-send'));
        await flush();

        expect(sendImages).not.toHaveBeenCalled();
        expect(picker.takePicked).not.toHaveBeenCalled();
        expect(toast).toHaveBeenCalledWith({ title: 'chat.attach.sendFailed', variant: 'destructive' });
        expect(onUnsentText).toHaveBeenCalledWith('look');
        expect(chips()).toHaveLength(1);
        expect(ready()).toBe('true');
    });

    it('holds the send while the waiting photos are read, so they cannot go twice', async () => {
        let finish: (pick: AttachmentPick) => void = () => undefined;
        const sendImages = jest.fn().mockResolvedValue(undefined);
        const shell = shellPicker(async () => ({ items: [shellPhoto], refused: [] }));
        shell.readPhotos = jest.fn(() => new Promise<AttachmentPick>(resolve => (finish = resolve)));
        render(<Harness sendImages={sendImages} shellPicker={shell} />);
        openSource('chat.attach.source.files');
        await flush();

        fireEvent.click(screen.getByTestId('composer-send'));
        await flush();
        expect(ready()).toBe('false');
        expect((files() as HTMLElement).closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true');
        fireEvent.click(screen.getByTestId('composer-send'));
        expect(sentPicked).toBe(false);

        await act(async () => finish({ items: [photo('shot.png', 'image/png')], refused: [] }));
        expect(sendImages).toHaveBeenCalledTimes(1);
    });

    it('keeps the waiting files with their room: another room shows its own, and coming back finds them', async () => {
        const sendImages = jest.fn().mockResolvedValue(undefined);
        const picker = gridPicker({ picked: [recent[0]] });
        const { rerender } = render(<Harness sendImages={sendImages} picker={picker} scope="room-a" />);
        pick('chat-attach-files', [doc('a.pdf')]);
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.open' }));
        expect(state()).toHaveAttribute('data-panel-open', 'true');

        rerender(<Harness sendImages={sendImages} picker={picker} scope="room-a" />);
        expect(chips()).toHaveLength(1);
        expect(picker.clearPicked).not.toHaveBeenCalled();

        // The picker's own state is mocked, so the cleared pick is handed in as the next render's.
        const cleared = gridPicker();
        rerender(<Harness sendImages={sendImages} picker={cleared} scope="room-b" />);

        expect(files()).not.toBeInTheDocument();
        expect(cleared.clearPicked).toHaveBeenCalledTimes(1);
        expect(state()).toHaveAttribute('data-panel-open', 'false');
        expect(ready()).toBe('false');

        pick('chat-attach-files', [doc('b.pdf')]);
        expect(chips().map(chip => chip.textContent)).toEqual([expect.stringContaining('b.pdf')]);

        rerender(<Harness sendImages={sendImages} picker={cleared} scope="room-a" />);
        expect(chips().map(chip => chip.textContent)).toEqual([expect.stringContaining('a.pdf')]);
        expect(ready()).toBe('true');

        fireEvent.click(screen.getByTestId('composer-send'));
        await flush();
        expect(sendImages).toHaveBeenCalledTimes(1);
        expect(sendImages.mock.calls[0][0].map((f: File) => f.name)).toEqual(['a.pdf']);
    });

    it('finds a room’s waiting files again after the composer left the page and came back', () => {
        const { unmount } = render(<Harness sendImages={jest.fn()} scope="room-a" />);
        pick('chat-attach-files', [doc('a.pdf')]);
        unmount();

        render(<Harness sendImages={jest.fn()} scope="room-a" />);

        expect(chips()).toHaveLength(1);
    });

    it('keeps nothing for a composer with no scope', () => {
        const { unmount } = render(<Harness sendImages={jest.fn()} />);
        pick('chat-attach-files', [doc('a.pdf')]);
        unmount();

        render(<Harness sendImages={jest.fn()} />);

        expect(files()).not.toBeInTheDocument();
    });

    it('lets sent files leave the room they waited in, even when the composer moved on during the read', async () => {
        let finish: (pick: AttachmentPick) => void = () => undefined;
        const sendImages = jest.fn().mockResolvedValue(undefined);
        const shell = shellPicker(async () => ({ items: [shellPhoto], refused: [] }));
        shell.readPhotos = jest.fn(() => new Promise<AttachmentPick>(resolve => (finish = resolve)));
        const { rerender } = render(<Harness sendImages={sendImages} shellPicker={shell} scope="room-a" />);
        openSource('chat.attach.source.files');
        await flush();
        fireEvent.click(screen.getByTestId('composer-send'));
        await flush();

        rerender(<Harness sendImages={sendImages} shellPicker={shell} scope="room-b" />);
        await act(async () => finish({ items: [photo('shot.png', 'image/png')], refused: [] }));
        expect(sendImages).toHaveBeenCalledTimes(1);

        rerender(<Harness sendImages={sendImages} shellPicker={shell} scope="room-a" />);
        expect(files()).not.toBeInTheDocument();
    });

    it('clears the in-app pick when the composer moves to another thread', () => {
        const picker = gridPicker({ picked: [recent[0]] });
        const { rerender } = render(<Harness sendImages={jest.fn()} picker={picker} scope="c1/5" />);

        rerender(<Harness sendImages={jest.fn()} picker={picker} scope="c1/6" />);

        expect(picker.clearPicked).toHaveBeenCalledTimes(1);
        expect(picker.closeGrid).toHaveBeenCalledTimes(1);
    });

    it('holds the send while a send reads the in-app pick, so the files cannot go twice', () => {
        render(<Harness sendImages={jest.fn()} picker={gridPicker({ picked: recent, preparing: true })} />);
        pick('chat-attach-files', [doc('a.pdf')]);

        expect(ready()).toBe('false');
        expect((files() as HTMLElement).closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true');
    });
});
