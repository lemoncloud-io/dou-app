import '@testing-library/jest-dom';

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import type { OnListPhotosPayload } from '@chatic/app-messages';
import type { ChatAttachmentSource } from '@chatic/data';
import type { PhotoEdit } from '@chatic/web-ui-kit';

import type { PhotoLibrary } from '../../../bridge/photoLibrary';
import { usePhotoPicker, type PhotoPicker } from '../hooks/usePhotoPicker';
import type { EditRendition } from '../utils/bakePhotoEdit';
import { useChatImageAttach } from './ChatImageAttach';

/**
 * Editing grid photos before the send, wired as the room wires it: the real `usePhotoPicker`, the real
 * attach flow and the kit's real grid sheet and editor. `ChatImageAttach.test.tsx` checks the attach
 * flow against a scripted picker and `usePhotoPicker.test.ts` the picker on its own; this is where the
 * two have to agree — that an edit applied in the editor is the one the picker draws at the send, that
 * ✕ puts back what the picker held, and that unpicking lets go of what the editor read. Only what lies
 * past the page is faked: the shell's library, the canvas (`bake`, `rendition`) and the send.
 */

const toast = jest.fn();
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: (arg: unknown) => toast(arg) }));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
    }),
}));
jest.mock('../../../bridge/appBridge', () => ({ appBridge: { openSettings: jest.fn() } }));
jest.mock('@chatic/bridges', () => ({ ...jest.requireActual('@chatic/bridges'), isNative: () => false }));
jest.mock('../utils/attachSources', () => ({
    ...jest.requireActual('../utils/attachSources'),
    isAppleTouchWebKit: () => false,
}));
// The attach flow's own picker stays the browser one: the test hands it the picker under test.
jest.mock('../../../bridge/photoLibrary', () => ({
    photoLibrary: { isUnsupported: () => true },
    photoPreviewSrc: (b64: string) => `data:${b64}`,
}));
jest.mock('../hooks/usePhotoGridColumns', () => ({
    usePhotoGridColumns: () => ({ columns: 3, setColumns: jest.fn() }),
}));
let mockGrouped = true;
jest.mock('../hooks/usePhotoSendGrouping', () => ({
    usePhotoSendGrouping: () => ({ grouped: mockGrouped, setGrouped: jest.fn() }),
}));

const page = (ids: string[]): OnListPhotosPayload => ({
    access: 'granted',
    items: ids.map(id => ({ id, thumbBase64: id })),
});

/** The shell's library, recording every read in order. */
const fakeLibrary = (reads: string[]): PhotoLibrary => ({
    albums: jest.fn().mockResolvedValue({ access: 'granted', albums: [{ id: 'all', title: 'Recents', count: 3 }] }),
    photos: jest.fn().mockResolvedValue(page(['a', 'b', 'c'])),
    read: jest.fn(async ({ id }) => {
        reads.push(id);
        return new File([id], `${id}.jpg`, { type: 'image/jpeg' });
    }),
    keepVideo: jest.fn(),
    videosSupported: jest.fn().mockReturnValue(true),
    pagesByOffset: jest.fn().mockReturnValue(true),
    manageSelection: jest.fn().mockResolvedValue('granted'),
    isUnsupported: jest.fn().mockReturnValue(false),
    reset: jest.fn(),
});

// Every photo is 4:3, so a square crop is a narrower box centred on it.
const rendition = jest.fn(
    async (file: File): Promise<EditRendition | null> => ({ src: `blob:${file.name}`, width: 400, height: 300 })
);
const bake = jest.fn(
    async (file: File, _edit: PhotoEdit): Promise<File | null> =>
        new File([file.name], file.name.replace('.', '-edit.'), { type: file.type })
);

let picker: PhotoPicker;

const Harness = ({
    library,
    sendImages,
}: {
    library: PhotoLibrary;
    sendImages: (files: ChatAttachmentSource[], options?: { separately?: boolean }) => Promise<void>;
}) => {
    picker = usePhotoPicker({ max: 10, allTitle: 'Recents', library, bake, rendition });
    const { button, overlays } = useChatImageAttach({ sendImages, picker });
    return (
        <>
            {button}
            {overlays}
        </>
    );
};

/** Probes the library, opens the grid and picks these photos, in order — what the grid's tiles do. */
const openAndPick = async (library: PhotoLibrary, sendImages = jest.fn().mockResolvedValue(undefined)) => {
    render(<Harness library={library} sendImages={sendImages} />);
    await act(() => picker.probe());
    // Async: the grid's first page and the album list land before anything is picked.
    await act(async () => picker.openGrid());
    for (const id of ['a', 'b', 'c']) act(() => picker.toggle({ id, src: `data:${id}` }));
    return sendImages;
};

const editor = () => screen.getByRole('dialog', { name: 'chat.attach.edit.title' });
const queryEditor = () => screen.queryByRole('dialog', { name: 'chat.attach.edit.title' });
const stripThumb = (position: number) =>
    screen.getByRole('button', { name: `chat.attach.edit.select:${JSON.stringify({ position })}` });

/** Crops the photo on screen to a square through the crop tool, and applies it. */
const cropToSquare = async () => {
    const crop = within(editor()).getByRole('button', { name: 'chat.attach.edit.crop' });
    await waitFor(() => expect(crop).toBeEnabled());
    fireEvent.click(crop);
    fireEvent.click(within(editor()).getByRole('button', { name: '1:1' }));
    fireEvent.click(within(editor()).getByRole('button', { name: 'chat.attach.edit.apply' }));
};

/** What a square crop of a 400 × 300 photo is, as `setPhotoEditAspect` fits it. */
const SQUARE: PhotoEdit = {
    rotation: 0,
    flipH: false,
    crop: { x: 0.125, y: 0, width: 0.75, height: 1 },
    aspect: '1:1',
};

beforeEach(() => {
    toast.mockClear();
    rendition.mockClear();
    bake.mockClear();
    mockGrouped = true;
    URL.revokeObjectURL = jest.fn();
});

describe('editing grid photos before the send, end to end', () => {
    it('crops a photo in the editor and sends the pick as one message each, drawing only that photo', async () => {
        mockGrouped = false;
        const reads: string[] = [];
        const sendImages = await openAndPick(fakeLibrary(reads));

        // Opened at the second photo: it is read first, then the ones either side.
        fireEvent.click(stripThumb(2));
        expect(editor()).toBeInTheDocument();
        await cropToSquare();
        await waitFor(() => expect(reads).toEqual(['b', 'c', 'a']));
        expect(picker.edits.get('b')).toEqual(SQUARE);

        // Back in the grid, the strip draws the photo as it will be sent.
        fireEvent.click(within(editor()).getByRole('button', { name: 'chat.attach.edit.done' }));
        expect(queryEditor()).not.toBeInTheDocument();
        expect(stripThumb(2)).toHaveAccessibleDescription('chat.attach.edit.edited');
        expect(stripThumb(1)).not.toHaveAccessibleDescription();

        // The editor's own send button sends the grid's pick.
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.edit.open' }));
        fireEvent.click(within(editor()).getByRole('button', { name: 'chat.attach.send:{"count":3}' }));

        await waitFor(() => expect(sendImages).toHaveBeenCalledTimes(1));
        // Every photo was read once, for the editor, and the send reused the bytes.
        expect(reads).toEqual(['b', 'c', 'a']);
        expect(bake).toHaveBeenCalledTimes(1);
        expect(bake).toHaveBeenCalledWith(expect.objectContaining({ name: 'b.jpg' }), SQUARE);
        const [files, options] = sendImages.mock.calls[0];
        expect(files.map((file: File) => file.name)).toEqual(['a.jpg', 'b-edit.jpg', 'c.jpg']);
        expect(options).toEqual({ separately: true });
        // The pick is gone, and with it every copy the editor drew from.
        expect(picker.picked).toEqual([]);
        expect(picker.edits.size).toBe(0);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:a.jpg');
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:b.jpg');
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:c.jpg');
    });

    it('throws away with ✕, after asking, only the edits made since the editor opened', async () => {
        await openAndPick(fakeLibrary([]));

        // A first visit, kept with Done.
        fireEvent.click(stripThumb(1));
        await cropToSquare();
        fireEvent.click(within(editor()).getByRole('button', { name: 'chat.attach.edit.done' }));

        // A second visit, left with ✕.
        fireEvent.click(stripThumb(3));
        await cropToSquare();
        expect([...picker.edits.keys()]).toEqual(['a', 'c']);
        fireEvent.click(within(editor()).getByRole('button', { name: 'chat.attach.edit.close' }));
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.edit.discard.confirm' }));

        expect(queryEditor()).not.toBeInTheDocument();
        expect([...picker.edits]).toEqual([['a', SQUARE]]);
        expect(stripThumb(1)).toHaveAccessibleDescription('chat.attach.edit.edited');
        expect(stripThumb(3)).not.toHaveAccessibleDescription();
    });

    it('reads nothing more for the editor once it closes, and the send reads the rest in its turn', async () => {
        const reads: string[] = [];
        const out = new Map<string, (file: File) => void>();
        const library: PhotoLibrary = {
            ...fakeLibrary(reads),
            read: jest.fn(({ id }: { id: string }) => {
                reads.push(id);
                return new Promise<File>(resolve => out.set(id, resolve));
            }),
        };
        const land = (id: string) =>
            act(async () => out.get(id)?.(new File([id], `${id}.jpg`, { type: 'image/jpeg' })));
        const sendImages = await openAndPick(library);

        // Opened at the first photo: it is read, and its neighbour waits behind it.
        fireEvent.click(stripThumb(1));
        expect(reads).toEqual(['a']);
        fireEvent.click(within(editor()).getByRole('button', { name: 'chat.attach.edit.done' }));

        // The read under way finishes, for the strip and the send; nothing is read after it.
        await land('a');
        await waitFor(() => expect(picker.editAssets.get('a')?.status).toBe('ready'));
        await act(async () => undefined);
        expect(reads).toEqual(['a']);

        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.send:{"count":3}' }));
        await waitFor(() => expect(reads).toEqual(['a', 'b']));
        await land('b');
        await waitFor(() => expect(reads).toEqual(['a', 'b', 'c']));
        await land('c');

        await waitFor(() => expect(sendImages).toHaveBeenCalledTimes(1));
        expect(sendImages.mock.calls[0][0].map((file: File) => file.name)).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
    });

    it('drops an edited photo’s edit and copy when it is unpicked, so picked again it goes as it was', async () => {
        const sendImages = await openAndPick(fakeLibrary([]));
        fireEvent.click(stripThumb(1));
        await cropToSquare();
        fireEvent.click(within(editor()).getByRole('button', { name: 'chat.attach.edit.done' }));

        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.removePicked:{"position":1}' }));

        expect(picker.edits.size).toBe(0);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:a.jpg');
        act(() => picker.toggle({ id: 'a', src: 'data:a' }));
        expect(stripThumb(3)).not.toHaveAccessibleDescription();

        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.send:{"count":3}' }));

        await waitFor(() => expect(sendImages).toHaveBeenCalledTimes(1));
        expect(bake).not.toHaveBeenCalled();
        expect(sendImages.mock.calls[0][0].map((file: File) => file.name)).toEqual(['b.jpg', 'c.jpg', 'a.jpg']);
        // Grouping is on: one message, sent the way every other pick is.
        expect(sendImages.mock.calls[0]).toHaveLength(1);
    });
});
