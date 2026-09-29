import { act, renderHook, waitFor } from '@testing-library/react';

import type { OnListPhotosPayload } from '@chatic/app-messages';

import type { PhotoLibrary } from '../../../bridge/photoLibrary';
import { usePhotoPicker } from './usePhotoPicker';

jest.mock('../../../bridge/photoLibrary', () => ({
    photoLibrary: {},
    photoPreviewSrc: (b64: string) => `data:${b64}`,
}));

const page = (ids: string[], next?: string): OnListPhotosPayload => ({
    access: 'granted',
    items: ids.map(id => ({ id, thumbBase64: id })),
    next,
});

const fakeLibrary = (over: Partial<PhotoLibrary> = {}): PhotoLibrary => ({
    albums: jest.fn().mockResolvedValue({ access: 'granted', albums: [{ id: 'all', title: 'Recents', count: 3 }] }),
    photos: jest.fn().mockResolvedValue(page(['a', 'b', 'c'])),
    read: jest.fn(async ({ id }) => new File([id], `${id}.jpg`, { type: 'image/jpeg' })),
    manageSelection: jest.fn().mockResolvedValue('limited'),
    isUnsupported: jest.fn().mockReturnValue(false),
    reset: jest.fn(),
    ...over,
});

const setup = (library: PhotoLibrary, max = 10) =>
    renderHook(() => usePhotoPicker({ max, allTitle: '최근 항목', library }));

describe('usePhotoPicker', () => {
    it('knows at once there is no picker in a browser or an old app', () => {
        const { result } = setup(fakeLibrary({ isUnsupported: jest.fn().mockReturnValue(true) }));
        expect(result.current.supported).toBe(false);
    });

    it('turns unsupported when the probe comes back empty-handed', async () => {
        const { result } = setup(fakeLibrary({ photos: jest.fn().mockResolvedValue(null) }));

        await act(() => result.current.probe());

        expect(result.current.supported).toBe(false);
        expect(result.current.recent).toEqual([]);
    });

    it('probes for the four newest photos to preview in the menu', async () => {
        const library = fakeLibrary({ photos: jest.fn().mockResolvedValue(page(['a', 'b', 'c', 'd'])) });
        const { result } = setup(library);

        await act(() => result.current.probe());

        expect(library.photos).toHaveBeenCalledWith({ limit: 4 });
        expect(result.current.supported).toBe(true);
        expect(result.current.recent.map(p => p.id)).toEqual(['a', 'b', 'c', 'd']);
        expect(result.current.recent[0].src).toBe('data:a');
    });

    it('opens the grid with a strip photo already picked and loads the first page and the albums', async () => {
        const library = fakeLibrary();
        const { result } = setup(library);

        act(() => result.current.openGrid({ id: 'b', src: 'data:b' }));

        await waitFor(() => expect(result.current.photos).toHaveLength(3));
        expect(result.current.gridOpen).toBe(true);
        expect(result.current.picked.map(p => p.id)).toEqual(['b']);
        await waitFor(() => expect(result.current.albums).toHaveLength(1));
    });

    it('keeps pick order and stops at the cap', () => {
        const { result } = setup(fakeLibrary(), 2);

        act(() => result.current.toggle({ id: 'c', src: '' }));
        act(() => result.current.toggle({ id: 'a', src: '' }));
        act(() => result.current.toggle({ id: 'b', src: '' }));
        expect(result.current.picked.map(p => p.id)).toEqual(['c', 'a']);

        act(() => result.current.toggle({ id: 'c', src: '' }));
        expect(result.current.picked.map(p => p.id)).toEqual(['a']);
    });

    // Two requests for the same cursor would append the same page twice.
    it('asks for one page at a time', async () => {
        let release: (value: OnListPhotosPayload) => void = () => undefined;
        const photos = jest
            .fn()
            .mockResolvedValueOnce(page(['a'], 'c1'))
            .mockImplementationOnce(() => new Promise(resolve => (release = resolve)));
        const { result } = setup(fakeLibrary({ photos }));

        act(() => result.current.openGrid());
        await waitFor(() => expect(result.current.hasMore).toBe(true));

        act(() => result.current.loadMore());
        act(() => result.current.loadMore());
        expect(photos).toHaveBeenCalledTimes(2);

        await act(async () => release(page(['b'])));
        expect(result.current.photos.map(p => p.id)).toEqual(['a', 'b']);
        expect(result.current.hasMore).toBe(false);
    });

    // A page for the album just left must not land in the one now on screen.
    it('drops a page that lands after the album changed, and keeps the picks', async () => {
        let releaseOld: (value: OnListPhotosPayload) => void = () => undefined;
        const photos = jest
            .fn()
            .mockImplementationOnce(() => new Promise(resolve => (releaseOld = resolve)))
            .mockResolvedValueOnce(page(['fav1']));
        const { result } = setup(fakeLibrary({ photos }));

        act(() => result.current.openGrid({ id: 'x', src: '' }));
        await waitFor(() => expect(result.current.albums).toHaveLength(1));
        act(() => result.current.selectAlbum('all'));
        await waitFor(() => expect(result.current.photos.map(p => p.id)).toEqual(['fav1']));

        await act(async () => releaseOld(page(['old1', 'old2'])));
        expect(result.current.photos.map(p => p.id)).toEqual(['fav1']);
        expect(result.current.picked.map(p => p.id)).toEqual(['x']);
    });

    it('reads the picks in pick order, closes the grid and clears the pick', async () => {
        const library = fakeLibrary();
        const { result } = setup(library);
        act(() => result.current.openGrid());
        act(() => result.current.toggle({ id: 'c', src: '' }));
        act(() => result.current.toggle({ id: 'a', src: '' }));

        let files: File[] = [];
        await act(async () => {
            files = await result.current.takePicked();
        });

        expect(files.map(f => f.name)).toEqual(['c.jpg', 'a.jpg']);
        expect(result.current.gridOpen).toBe(false);
        expect(result.current.picked).toEqual([]);
    });

    it('lists again after the limited-access sheet closes', async () => {
        const library = fakeLibrary();
        const { result } = setup(library);

        await act(() => result.current.manageSelection());

        expect(library.manageSelection).toHaveBeenCalledTimes(1);
        expect(library.photos).toHaveBeenCalledWith({ albumId: undefined, after: undefined, limit: 60 });
        // The fresh page's own answer wins over what the sheet reported a moment earlier.
        await waitFor(() => expect(result.current.access).toBe('granted'));
    });
});
