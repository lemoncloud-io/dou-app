import { act, renderHook, waitFor } from '@testing-library/react';

import type { OnListPhotosPayload } from '@chatic/app-messages';

import type { PhotoLibrary } from '../../../bridge/photoLibrary';
import { usePhotoPicker, type PickedFromGrid } from './usePhotoPicker';

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
    keepVideo: jest.fn(async ({ id }) => ({
        uri: `file:///c/attach-pick/${id}/${id}.mp4`,
        name: `${id}.mp4`,
        type: 'video/mp4',
        size: 10,
        kind: 'video' as const,
    })),
    videosSupported: jest.fn().mockReturnValue(true),
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

        let picked: PickedFromGrid = { items: [], refused: [] };
        await act(async () => {
            picked = await result.current.takePicked();
        });

        expect(picked.items.map(f => f.name)).toEqual(['c.jpg', 'a.jpg']);
        expect(picked.refused).toEqual([]);
        expect(result.current.gridOpen).toBe(false);
        expect(result.current.picked).toEqual([]);
    });

    it('lists videos as video items with their length, and photos as before', async () => {
        const library = fakeLibrary({
            photos: jest.fn().mockResolvedValue({
                access: 'granted',
                items: [
                    { id: 'p', thumbBase64: 'p' },
                    { id: 'v:9', thumbBase64: 'v', mediaType: 'video', durationMs: 42_000 },
                    { id: 'p2', thumbBase64: 'p2', mediaType: 'image' },
                ],
            }),
        });
        const { result } = setup(library);

        await act(() => result.current.probe());

        expect(result.current.recent).toEqual([
            { id: 'p', src: 'data:p' },
            { id: 'v:9', src: 'data:v', kind: 'video', durationMs: 42_000 },
            { id: 'p2', src: 'data:p2' },
        ]);
    });

    it('reads photos and keeps videos in pick order, one at a time', async () => {
        const calls: string[] = [];
        const library = fakeLibrary({
            read: jest.fn(async ({ id }) => {
                calls.push(`read ${id}`);
                return new File([id], `${id}.jpg`, { type: 'image/jpeg' });
            }),
            keepVideo: jest.fn(async ({ id }) => {
                calls.push(`keep ${id}`);
                return {
                    uri: `file:///c/attach-pick/x/${id}.mp4`,
                    name: `${id}.mp4`,
                    type: 'video/mp4',
                    size: 1,
                    kind: 'video' as const,
                };
            }),
        });
        const { result } = setup(library);
        act(() => result.current.openGrid());
        act(() => result.current.toggle({ id: 'a', src: '' }));
        act(() => result.current.toggle({ id: 'v1', src: '', kind: 'video' }));
        act(() => result.current.toggle({ id: 'b', src: '' }));

        let picked: PickedFromGrid = { items: [], refused: [] };
        await act(async () => {
            picked = await result.current.takePicked();
        });

        expect(calls).toEqual(['read a', 'keep v1', 'read b']);
        expect(picked.items.map(item => item.name)).toEqual(['a.jpg', 'v1.mp4', 'b.jpg']);
    });

    it('refuses an item it could not read or keep, and still hands over the rest', async () => {
        const library = fakeLibrary({
            read: jest.fn(async ({ id }) => {
                if (id === 'gone') throw Object.assign(new Error('x'), { code: 'PHOTO_MISSING' });
                return new File([id], `${id}.jpg`, { type: 'image/jpeg' });
            }),
            keepVideo: jest.fn(async ({ id }) => {
                throw Object.assign(new Error(id), {
                    code: id === 'hevc' ? 'UNSUPPORTED' : id === 'big' ? 'TOO_LARGE' : 'READ_FAILED',
                });
            }),
        });
        const { result } = setup(library);
        act(() => result.current.openGrid());
        for (const item of [
            { id: 'a', src: '' },
            { id: 'hevc', src: '', kind: 'video' as const },
            { id: 'gone', src: '' },
            { id: 'big', src: '', kind: 'video' as const },
            { id: 'icloud', src: '', kind: 'video' as const },
        ]) {
            act(() => result.current.toggle(item));
        }

        let picked: PickedFromGrid = { items: [], refused: [] };
        await act(async () => {
            picked = await result.current.takePicked();
        });

        expect(picked.items.map(item => item.name)).toEqual(['a.jpg']);
        expect(picked.refused).toEqual([
            { name: '', kind: 'video', reason: 'unsupported' },
            { name: '', kind: 'image', reason: 'unreadable' },
            { name: '', kind: 'video', reason: 'too-large' },
            { name: '', kind: 'video', reason: 'unreadable' },
        ]);
    });

    it('keeps the grid open and says it is preparing until the pick is read', async () => {
        let finish: () => void = () => undefined;
        const library = fakeLibrary({
            keepVideo: jest.fn(
                () =>
                    new Promise(resolve => {
                        finish = () =>
                            resolve({
                                uri: 'file:///c/attach-pick/x/v.mp4',
                                name: 'v.mp4',
                                type: 'video/mp4',
                                size: 1,
                                kind: 'video',
                            });
                    })
            ),
        });
        const { result } = setup(library);
        act(() => result.current.openGrid());
        act(() => result.current.toggle({ id: 'v', src: '', kind: 'video' }));

        let taking: Promise<PickedFromGrid> = Promise.resolve({ items: [], refused: [] });
        act(() => {
            taking = result.current.takePicked();
        });
        expect(result.current.gridOpen).toBe(true);
        expect(result.current.preparing).toBe(true);
        // Frozen meanwhile: a pick changed now would be cleared, unsent, when the read ends.
        act(() => result.current.toggle({ id: 'p', src: '' }));
        act(() => result.current.closeGrid());
        expect(result.current.picked.map(p => p.id)).toEqual(['v']);
        expect(result.current.gridOpen).toBe(true);

        await act(async () => {
            finish();
            await taking;
        });
        expect(result.current.preparing).toBe(false);
        expect(result.current.gridOpen).toBe(false);
    });

    it('drops the listed videos once the app turns out unable to keep one', async () => {
        let supported = true;
        const library = fakeLibrary({
            photos: jest.fn().mockResolvedValue({
                access: 'granted',
                items: [
                    { id: 'p', thumbBase64: 'p' },
                    { id: 'v', thumbBase64: 'v', mediaType: 'video' },
                ],
            }),
            keepVideo: jest.fn(async () => {
                supported = false;
                throw Object.assign(new Error('no handler'), { code: 'NOT_FOUND' });
            }),
            videosSupported: jest.fn(() => supported),
        });
        const { result } = setup(library);
        await act(() => result.current.probe());
        act(() => result.current.openGrid());
        await waitFor(() => expect(result.current.photos).toHaveLength(2));
        act(() => result.current.toggle({ id: 'v', src: '', kind: 'video' }));

        await act(async () => {
            await result.current.takePicked();
        });

        expect(result.current.photos.map(p => p.id)).toEqual(['p']);
        expect(result.current.recent.map(p => p.id)).toEqual(['p']);
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

    it('still lists again when the limited-access sheet call fails', async () => {
        const library = fakeLibrary({ manageSelection: jest.fn().mockRejectedValue(new Error('timeout')) });
        const { result } = setup(library);

        await act(() => result.current.manageSelection());

        expect(library.photos).toHaveBeenCalledWith({ albumId: undefined, after: undefined, limit: 60 });
        await waitFor(() => expect(result.current.access).toBe('granted'));
    });
});
