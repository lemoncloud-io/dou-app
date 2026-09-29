import '@testing-library/jest-dom';

import { act, fireEvent, render, screen } from '@testing-library/react';

import type { PhotoPicker } from '../hooks/usePhotoPicker';
import { useChatImageAttach } from './ChatImageAttach';

const toast = jest.fn();
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: (arg: unknown) => toast(arg) }));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
    }),
}));

const openSettings = jest.fn();
jest.mock('../../../bridge/appBridge', () => ({ appBridge: { openSettings: () => openSettings() } }));

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
    photos: [],
    hasMore: false,
    loadMore: jest.fn(),
    picked: [],
    toggle: jest.fn(),
    takePicked: jest.fn().mockResolvedValue([]),
    manageSelection: jest.fn().mockResolvedValue(undefined),
});
// The component's own picker is the browser/old-app one unless a test injects another.
jest.mock('../hooks/usePhotoPicker', () => ({ usePhotoPicker: () => mockOwnPicker }));
let mockOwnPicker: PhotoPicker = unsupportedPicker();

const photo = (name: string, type = 'image/jpeg', lastModified = 1) => new File(['x'], name, { type, lastModified });

const Harness = ({
    sendImages,
    disabled,
    picker,
}: {
    sendImages: (files: File[]) => Promise<void>;
    disabled?: boolean;
    picker?: PhotoPicker;
}) => {
    const { button, overlays } = useChatImageAttach({ sendImages, disabled, picker });
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
            photos: [{ id: 'p1', src: 'data:p1' }],
            takePicked: jest.fn().mockResolvedValue([photo('p1.jpg'), photo('p2.heic', 'image/heic')]),
        });
        render(<Harness sendImages={sendImages} picker={picker} />);

        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.send:{"count":1}' }));
        await act(async () => undefined);

        expect(sendImages.mock.calls[0][0].map((f: File) => f.name)).toEqual(['p1.jpg']);
        expect(toast.mock.calls[0][0].title).toContain('chat.attach.rejected.unsupported');
    });
});
