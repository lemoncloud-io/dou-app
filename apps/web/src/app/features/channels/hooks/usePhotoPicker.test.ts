import { act, renderHook, waitFor } from '@testing-library/react';

import type { OnListPhotosPayload } from '@chatic/app-messages';

import type { PhotoLibrary } from '../../../bridge/photoLibrary';
import { needsSharperThumbs, PAGE_SIZE, pageToLoad, usePhotoPicker, type PickedFromGrid } from './usePhotoPicker';

jest.mock('../../../bridge/photoLibrary', () => ({
    photoLibrary: {},
    photoPreviewSrc: (b64: string) => `data:${b64}`,
}));

const page = (ids: string[], next?: string): OnListPhotosPayload => ({
    access: 'granted',
    items: ids.map(id => ({ id, thumbBase64: id })),
    next,
});

/** A page from an app that pages by offset: the ids from `offset`, of a list `total` long. */
const offsetPage = (
    offset: number,
    total: number,
    count = Math.min(PAGE_SIZE, total - offset)
): OnListPhotosPayload => ({
    access: 'granted',
    items: Array.from({ length: Math.max(0, count) }, (_, i) => ({
        id: `p${offset + i}`,
        thumbBase64: `t${offset + i}`,
    })),
    offset,
    total,
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
    pagesByOffset: jest.fn().mockReturnValue(true),
    manageSelection: jest.fn().mockResolvedValue('limited'),
    isUnsupported: jest.fn().mockReturnValue(false),
    reset: jest.fn(),
    ...over,
});

const setup = (library: PhotoLibrary, max = 10) =>
    renderHook(() => usePhotoPicker({ max, allTitle: '최근 항목', library }));

/** The ids the grid lays out, `undefined` where a position has not loaded. */
const gridIds = (picker: { count: number; photoAt(index: number): { id: string } | undefined }) =>
    Array.from({ length: picker.count }, (_, i) => picker.photoAt(i)?.id);

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

        expect(library.photos).toHaveBeenCalledWith({ limit: 4, thumbSize: expect.any(Number) });
        expect(result.current.supported).toBe(true);
        expect(result.current.recent.map(p => p.id)).toEqual(['a', 'b', 'c', 'd']);
        expect(result.current.recent[0].src).toBe('data:a');
    });

    it('opens the grid with a strip photo already picked and loads the first page and the albums', async () => {
        const library = fakeLibrary();
        const { result } = setup(library);

        act(() => result.current.openGrid({ id: 'b', src: 'data:b' }));

        await waitFor(() => expect(gridIds(result.current)).toEqual(['a', 'b', 'c']));
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
    it('pages by cursor on an app that does not echo the offset, one page at a time', async () => {
        let release: (value: OnListPhotosPayload) => void = () => undefined;
        const photos = jest
            .fn()
            .mockResolvedValueOnce(page(['a'], 'c1'))
            .mockImplementationOnce(() => new Promise(resolve => (release = resolve)));
        const { result } = setup(fakeLibrary({ photos }));

        act(() => result.current.openGrid());
        await waitFor(() => expect(result.current.count).toBe(1));
        expect(photos).toHaveBeenNthCalledWith(1, expect.objectContaining({ offset: 0, limit: PAGE_SIZE }));

        act(() => result.current.setVisibleRange({ start: 0, end: 1 }));
        act(() => result.current.setVisibleRange({ start: 0, end: 1 }));
        expect(photos).toHaveBeenCalledTimes(2);
        expect(photos).toHaveBeenNthCalledWith(2, expect.objectContaining({ after: 'c1' }));

        await act(async () => release(page(['b'])));
        expect(gridIds(result.current)).toEqual(['a', 'b']);
        // The last page had no cursor: nothing more to ask for.
        act(() => result.current.setVisibleRange({ start: 0, end: 2 }));
        expect(photos).toHaveBeenCalledTimes(2);
    });

    it('asks an app known to page by cursor for its first page without an offset', async () => {
        const library = fakeLibrary({ pagesByOffset: jest.fn().mockReturnValue(false) });
        const { result } = setup(library);

        act(() => result.current.openGrid());
        await waitFor(() => expect(result.current.count).toBe(3));

        expect(library.photos).toHaveBeenCalledWith(expect.not.objectContaining({ offset: expect.anything() }));
    });

    it('lays out the whole album from the first page answered by offset', async () => {
        const library = fakeLibrary({ photos: jest.fn().mockResolvedValue(offsetPage(0, 500)) });
        const { result } = setup(library);

        act(() => result.current.openGrid());
        await waitFor(() => expect(result.current.count).toBe(500));

        expect(result.current.photoAt(0)).toEqual({ id: 'p0', src: 'data:t0' });
        expect(result.current.photoAt(59)?.id).toBe('p59');
        expect(result.current.photoAt(60)).toBeUndefined();
        expect(library.albums).toHaveBeenCalledWith({ thumbSize: expect.any(Number) });
    });

    // A fast-scroll to the far end of a long album asks for that stretch, not for everything before it.
    it('jumps straight to the page a far range needs', async () => {
        const photos = jest.fn(async ({ offset = 0 }: { offset?: number }) => offsetPage(offset, 5000));
        const { result } = setup(fakeLibrary({ photos }));
        act(() => result.current.openGrid());
        await waitFor(() => expect(result.current.count).toBe(5000));

        await act(async () => result.current.setVisibleRange({ start: 4950, end: 4990, thumbSize: 400 }));

        await waitFor(() => expect(result.current.photoAt(4989)?.id).toBe('p4989'));
        // The two pages the range straddles, the one holding more of it first.
        expect(photos.mock.calls.map(([request]) => request.offset)).toEqual([0, 4920, 4980]);
        expect(photos).toHaveBeenLastCalledWith(expect.objectContaining({ thumbSize: 400 }));
        expect(result.current.photoAt(3000)).toBeUndefined();
    });

    it('asks for one page at a time, the nearest to the middle of the range first', async () => {
        const releases: Array<() => void> = [];
        const photos = jest.fn(
            ({ offset = 0 }: { offset?: number }) =>
                new Promise<OnListPhotosPayload>(resolve => releases.push(() => resolve(offsetPage(offset, 1000))))
        );
        const { result } = setup(fakeLibrary({ photos }));
        act(() => result.current.openGrid());
        await act(async () => releases.shift()?.());

        act(() => result.current.setVisibleRange({ start: 70, end: 250, thumbSize: 400 }));
        expect(photos).toHaveBeenCalledTimes(2);
        expect(photos).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 120 }));

        await act(async () => releases.shift()?.());
        expect(photos).toHaveBeenCalledTimes(3);
        await act(async () => releases.shift()?.());
        await act(async () => releases.shift()?.());
        expect(photos.mock.calls.map(([request]) => request.offset)).toEqual([0, 120, 180, 60, 240]);
    });

    it('draws an item the app could make no preview of as an empty tile in its own place', async () => {
        const answer = offsetPage(0, 2);
        answer.items[0] = { id: 'p0', thumbBase64: '' };
        const { result } = setup(fakeLibrary({ photos: jest.fn().mockResolvedValue(answer) }));

        act(() => result.current.openGrid());
        await waitFor(() => expect(result.current.count).toBe(2));

        expect(result.current.photoAt(0)).toEqual({ id: 'p0', src: '' });
        expect(result.current.photoAt(1)?.id).toBe('p1');
    });

    // A photo taken while the grid is open shifts every index after it by one.
    it('lays out again when the library count changes, and asks for the visible pages again', async () => {
        const photos = jest
            .fn()
            .mockResolvedValueOnce(offsetPage(0, 200))
            .mockResolvedValueOnce(offsetPage(60, 201))
            .mockImplementation(async ({ offset = 0 }: { offset?: number }) => offsetPage(offset, 201));
        const { result } = setup(fakeLibrary({ photos }));
        act(() => result.current.openGrid());
        await waitFor(() => expect(result.current.count).toBe(200));

        await act(async () => result.current.setVisibleRange({ start: 30, end: 90, thumbSize: 400 }));

        await waitFor(() => expect(result.current.count).toBe(201));
        expect(photos.mock.calls.map(([request]) => request.offset)).toEqual([0, 60, 0]);
        expect(result.current.photoAt(0)?.id).toBe('p0');
        expect(result.current.photoAt(60)?.id).toBe('p60');
    });

    it('asks for visible pages again at a larger size once the tiles grow past their previews', async () => {
        const photos = jest.fn(async ({ offset = 0 }: { offset?: number }) => offsetPage(offset, 100));
        const { result } = setup(fakeLibrary({ photos }));
        act(() => result.current.openGrid());
        await waitFor(() => expect(result.current.count).toBe(100));
        await act(async () => result.current.setVisibleRange({ start: 0, end: 30, thumbSize: 500 }));
        await waitFor(() => expect(photos).toHaveBeenLastCalledWith(expect.objectContaining({ thumbSize: 500 })));
        const asked = photos.mock.calls.length;

        // A little larger (five columns to four): not worth a refetch.
        await act(async () => result.current.setVisibleRange({ start: 0, end: 30, thumbSize: 592 }));
        expect(photos).toHaveBeenCalledTimes(asked);

        // Well past what was fetched (three columns to two).
        await act(async () => result.current.setVisibleRange({ start: 0, end: 30, thumbSize: 752 }));
        await waitFor(() => expect(photos).toHaveBeenCalledTimes(asked + 1));
        expect(photos).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0, thumbSize: 752 }));
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
        await waitFor(() => expect(gridIds(result.current)).toEqual(['fav1']));
        expect(photos).toHaveBeenLastCalledWith(expect.objectContaining({ albumId: 'all' }));

        await act(async () => releaseOld(page(['old1', 'old2'])));
        expect(gridIds(result.current)).toEqual(['fav1']);
        expect(result.current.picked.map(p => p.id)).toEqual(['x']);
    });

    // A failure that repeats must not turn into a loop: the same page would be picked again at once.
    it('does not ask again at once when a page fails, and asks again when the range moves', async () => {
        const photos = jest.fn().mockRejectedValue(Object.assign(new Error('x'), { code: 'INTERNAL' }));
        const { result } = setup(fakeLibrary({ photos }));

        act(() => result.current.openGrid());
        await act(async () => undefined);
        await act(async () => undefined);
        expect(photos).toHaveBeenCalledTimes(1);

        await act(async () => result.current.setVisibleRange({ start: 0, end: 30, thumbSize: 400 }));
        expect(photos).toHaveBeenCalledTimes(2);
    });

    it('does not spin on a shell that answers no page at all', async () => {
        const photos = jest.fn().mockResolvedValue(null);
        const { result } = setup(fakeLibrary({ photos }));

        act(() => result.current.openGrid());
        await act(async () => undefined);
        await act(async () => undefined);

        expect(photos).toHaveBeenCalledTimes(1);
    });

    // Photos deleted while the grid is open: a page asked past the new end comes back clamped to it.
    it('does not mark a page loaded from an answer clamped to a shrunken list', async () => {
        const photos = jest
            .fn()
            .mockResolvedValueOnce(offsetPage(0, 125))
            .mockResolvedValueOnce(offsetPage(115, 115, 0))
            .mockImplementation(async ({ offset = 0 }: { offset?: number }) => offsetPage(offset, 115));
        const { result } = setup(fakeLibrary({ photos }));
        act(() => result.current.openGrid());
        await waitFor(() => expect(result.current.count).toBe(125));

        await act(async () => result.current.setVisibleRange({ start: 120, end: 125, thumbSize: 400 }));
        await waitFor(() => expect(result.current.count).toBe(115));

        await act(async () => result.current.setVisibleRange({ start: 70, end: 115, thumbSize: 400 }));
        await waitFor(() => expect(result.current.photoAt(100)?.id).toBe('p100'));
        expect(photos.mock.calls.map(([request]) => request.offset)).toEqual([0, 120, 60]);
    });

    it('asks nothing while the grid is closed', async () => {
        const library = fakeLibrary();
        const { result } = setup(library);

        act(() => result.current.setVisibleRange({ start: 0, end: 60, thumbSize: 400 }));

        expect(library.photos).not.toHaveBeenCalled();
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
        await waitFor(() => expect(result.current.count).toBe(2));
        act(() => result.current.toggle({ id: 'v', src: '', kind: 'video' }));

        await act(async () => {
            await result.current.takePicked();
        });

        // The grid lists afresh when it next opens, and the list leaves videos out from then on.
        expect(result.current.count).toBe(0);
        expect(result.current.recent.map(p => p.id)).toEqual(['p']);
    });

    it('lists again after the limited-access sheet closes', async () => {
        const library = fakeLibrary({ manageSelection: jest.fn().mockResolvedValue('limited') });
        const { result } = setup(library);
        act(() => result.current.openGrid());
        await waitFor(() => expect(result.current.count).toBe(3));

        await act(() => result.current.manageSelection());

        expect(library.manageSelection).toHaveBeenCalledTimes(1);
        expect(library.photos).toHaveBeenCalledTimes(2);
        expect(library.photos).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0, limit: PAGE_SIZE }));
        // The fresh page's own answer wins over what the sheet reported a moment earlier.
        await waitFor(() => expect(result.current.access).toBe('granted'));
    });

    it('still lists again when the limited-access sheet call fails', async () => {
        const library = fakeLibrary({ manageSelection: jest.fn().mockRejectedValue(new Error('timeout')) });
        const { result } = setup(library);
        act(() => result.current.openGrid());

        await act(() => result.current.manageSelection());

        expect(library.photos).toHaveBeenCalledTimes(2);
        await waitFor(() => expect(result.current.access).toBe('granted'));
    });
});

describe('pageToLoad', () => {
    const loaded = (entries: Array<[number, number]>) => new Map(entries);

    it('picks the unloaded page nearest the middle of the range', () => {
        expect(pageToLoad({ range: { start: 70, end: 250 }, total: 1000, loaded: loaded([]) })).toBe(2);
        // Page 3 (180–239) holds more of the range's middle than page 1 (60–119).
        expect(pageToLoad({ range: { start: 70, end: 250 }, total: 1000, loaded: loaded([[2, 400]]) })).toBe(3);
    });

    it('answers nothing once every page in range has loaded at a size good enough', () => {
        const range = { start: 0, end: 120, thumbSize: 400 };
        expect(
            pageToLoad({
                range,
                total: 1000,
                loaded: loaded([
                    [0, 400],
                    [1, 384],
                ]),
            })
        ).toBeUndefined();
    });

    it('asks again for a page loaded too small for the tiles now', () => {
        const range = { start: 0, end: 60, thumbSize: 592 };
        expect(pageToLoad({ range, total: 1000, loaded: loaded([[0, 400]]) })).toBe(0);
    });

    it('keeps the range inside the list', () => {
        expect(pageToLoad({ range: { start: 990, end: 1100 }, total: 1000, loaded: loaded([]) })).toBe(16);
        expect(pageToLoad({ range: { start: 0, end: 60 }, total: 0, loaded: loaded([]) })).toBeUndefined();
    });
});

describe('needsSharperThumbs', () => {
    it('allows a fifth of growth before asking again, and never without a size to want', () => {
        expect(needsSharperThumbs(400, 480)).toBe(false);
        expect(needsSharperThumbs(400, 481)).toBe(true);
        expect(needsSharperThumbs(0, 400)).toBe(true);
        expect(needsSharperThumbs(400, undefined)).toBe(false);
    });
});
