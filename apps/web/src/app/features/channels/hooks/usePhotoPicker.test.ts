import { act, renderHook, waitFor } from '@testing-library/react';

import type { OnListPhotosPayload } from '@chatic/app-messages';

import type { PhotoLibrary } from '../../../bridge/photoLibrary';
import {
    FIRST_PAGE_RETRY_MS,
    FIRST_PAGE_SIZE,
    keptPages,
    needsSharperThumbs,
    offsetRequest,
    PAGE_SIZE,
    pageAhead,
    pageToLoad,
    usePhotoPicker,
    type PickedFromGrid,
} from './usePhotoPicker';

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
        // The short first page, then — the end already in view — the next page by its cursor, full size.
        expect(photos).toHaveBeenNthCalledWith(1, expect.objectContaining({ offset: 0, limit: FIRST_PAGE_SIZE }));
        expect(photos).toHaveBeenNthCalledWith(2, expect.objectContaining({ after: 'c1', limit: PAGE_SIZE }));

        act(() => result.current.setVisibleRange({ start: 0, end: 1 }));
        act(() => result.current.setVisibleRange({ start: 0, end: 1 }));
        expect(photos).toHaveBeenCalledTimes(2);

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
        const photos = jest.fn(async ({ offset = 0, limit }: { offset?: number; limit: number }) =>
            offsetPage(offset, 5000, Math.min(limit, 5000 - offset))
        );
        const { result } = setup(fakeLibrary({ photos }));
        act(() => result.current.openGrid());
        await waitFor(() => expect(result.current.count).toBe(5000));

        await act(async () => result.current.setVisibleRange({ start: 4950, end: 4990, thumbSize: 400 }));

        await waitFor(() => expect(result.current.photoAt(4989)?.id).toBe('p4989'));
        // The short first page, the rest of page 0 and page 1 ahead of it; then the two pages the far range
        // straddles, the one holding more of it first — and none of the 80 pages between.
        expect(photos.mock.calls.map(([request]) => request.offset)).toEqual([0, FIRST_PAGE_SIZE, 60, 4920, 4980]);
        expect(photos).toHaveBeenLastCalledWith(expect.objectContaining({ thumbSize: 400 }));
        expect(result.current.photoAt(3000)).toBeUndefined();
    });

    it('asks for one page at a time, the nearest to the middle of the range first', async () => {
        const releases: Array<() => void> = [];
        const photos = jest.fn(
            ({ offset = 0, limit }: { offset?: number; limit: number }) =>
                new Promise<OnListPhotosPayload>(resolve =>
                    releases.push(() => resolve(offsetPage(offset, 1000, limit)))
                )
        );
        const { result } = setup(fakeLibrary({ photos }));
        act(() => result.current.openGrid());
        // The short first page, then the rest of page 0 from where it stopped.
        await act(async () => releases.shift()?.());
        expect(photos).toHaveBeenLastCalledWith(expect.objectContaining({ offset: FIRST_PAGE_SIZE, limit: 36 }));
        act(() => result.current.setVisibleRange({ start: 70, end: 250, thumbSize: 400 }));
        expect(photos).toHaveBeenCalledTimes(2);
        await act(async () => releases.shift()?.());

        expect(photos).toHaveBeenCalledTimes(3);
        expect(photos).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 120 }));
        await act(async () => releases.shift()?.());
        await act(async () => releases.shift()?.());
        await act(async () => releases.shift()?.());
        // Range pages nearest the middle first, then the one past its end, the way it scrolled.
        await act(async () => releases.shift()?.());
        expect(photos.mock.calls.map(([request]) => request.offset)).toEqual([0, 24, 120, 180, 60, 240, 300]);
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
        // The library gains a photo between the short first page and the rest of page 0.
        let total = 200;
        const photos = jest.fn(async ({ offset = 0, limit }: { offset?: number; limit: number }) => {
            if (offset === FIRST_PAGE_SIZE) total = 201;
            return offsetPage(offset, total, Math.min(limit, total - offset));
        });
        const { result } = setup(fakeLibrary({ photos }));
        act(() => result.current.openGrid());

        await waitFor(() => expect(result.current.count).toBe(201));
        await act(async () => result.current.setVisibleRange({ start: 30, end: 90, thumbSize: 400 }));

        // The rest of page 0 came back at a new count: page 0 is asked for again, whole.
        expect(photos.mock.calls.map(([request]) => request.offset).slice(0, 3)).toEqual([0, FIRST_PAGE_SIZE, 0]);
        await waitFor(() => expect(result.current.photoAt(60)?.id).toBe('p60'));
        expect(result.current.photoAt(0)?.id).toBe('p0');
    });

    it('asks for visible pages again at a larger size once the tiles grow past their previews', async () => {
        const photos = jest.fn(async ({ offset = 0, limit }: { offset?: number; limit: number; thumbSize?: number }) =>
            offsetPage(offset, 100, Math.min(limit, 100 - offset))
        );
        const asked = (size: number) =>
            photos.mock.calls.filter(([request]) => request.thumbSize === size).map(([request]) => request.offset);
        const { result } = setup(fakeLibrary({ photos }));
        act(() => result.current.openGrid());
        await waitFor(() => expect(result.current.count).toBe(100));
        await act(async () => result.current.setVisibleRange({ start: 0, end: 30, thumbSize: 500 }));
        await waitFor(() => expect(asked(500)).toEqual([0, 60]));

        // A little larger (five columns to four): not worth a refetch.
        await act(async () => result.current.setVisibleRange({ start: 0, end: 30, thumbSize: 592 }));
        expect(asked(592)).toEqual([]);

        // Well past what was fetched (three columns to two): the page on screen first, then the one ahead.
        await act(async () => result.current.setVisibleRange({ start: 0, end: 30, thumbSize: 752 }));
        await waitFor(() => expect(asked(752)).toEqual([0, 60]));
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
        // Ten photos are deleted while the grid is open; the page asked for past the new end comes back
        // clamped to it.
        let total = 125;
        const photos = jest.fn(async ({ offset = 0, limit }: { offset?: number; limit: number }) => {
            if (offset === 120) {
                total = 115;
                return offsetPage(115, 115, 0);
            }
            return offsetPage(offset, total, Math.min(limit, total - offset));
        });
        const { result } = setup(fakeLibrary({ photos }));
        act(() => result.current.openGrid());
        await waitFor(() => expect(result.current.photoAt(119)?.id).toBe('p119'));

        await act(async () => result.current.setVisibleRange({ start: 120, end: 125, thumbSize: 400 }));
        await waitFor(() => expect(result.current.count).toBe(115));

        await act(async () => result.current.setVisibleRange({ start: 70, end: 115, thumbSize: 400 }));
        await waitFor(() => expect(result.current.photoAt(100)?.id).toBe('p100'));
        const calls = photos.mock.calls.map(([request]) => request.offset);
        // Page 1 is asked for again after the clamped answer rather than taken as loaded.
        expect(calls.lastIndexOf(60)).toBeGreaterThan(calls.indexOf(120));
    });

    // A long scroll must not keep every preview it passed: far pages let theirs go and come back on view.
    it('lets go of previews far from the screen and asks for them again when they come back', async () => {
        const photos = jest.fn(async ({ offset = 0, limit }: { offset?: number; limit: number }) =>
            offsetPage(offset, 3000, Math.min(limit, 3000 - offset))
        );
        const { result } = setup(fakeLibrary({ photos }));
        act(() => result.current.openGrid());
        await waitFor(() => expect(result.current.photoAt(59)?.src).toBe('data:t59'));

        await act(async () => result.current.setVisibleRange({ start: 2400, end: 2430, thumbSize: 400 }));
        await waitFor(() => expect(result.current.photoAt(2400)?.src).toBe('data:t2400'));

        // Page 0 is far from page 40: its photos keep their place, their previews on their way back.
        expect(result.current.count).toBe(3000);
        expect(result.current.photoAt(0)).toBeUndefined();

        await act(async () => result.current.setVisibleRange({ start: 0, end: 30, thumbSize: 400 }));
        await waitFor(() => expect(result.current.photoAt(0)?.src).toBe('data:t0'));
        // The short first page and the rest of page 0, page 1 ahead, page 40 and the one past it, page 0 again.
        expect(photos.mock.calls.map(([request]) => request.offset)).toEqual([0, FIRST_PAGE_SIZE, 60, 2400, 2460, 0]);
        // And page 40 has gone in its turn.
        expect(result.current.photoAt(2400)).toBeUndefined();
    });

    it('keeps the previews of nearby pages, so a short scroll back asks for nothing', async () => {
        const photos = jest.fn(async ({ offset = 0, limit }: { offset?: number; limit: number }) =>
            offsetPage(offset, 3000, Math.min(limit, 3000 - offset))
        );
        const { result } = setup(fakeLibrary({ photos }));
        act(() => result.current.openGrid());
        await waitFor(() => expect(result.current.count).toBe(3000));

        await act(async () => result.current.setVisibleRange({ start: 120, end: 150, thumbSize: 400 }));
        await waitFor(() => expect(result.current.photoAt(120)?.src).toBe('data:t120'));
        const asked = photos.mock.calls.length;
        await act(async () => result.current.setVisibleRange({ start: 0, end: 30, thumbSize: 400 }));

        expect(result.current.photoAt(0)?.src).toBe('data:t0');
        expect(photos).toHaveBeenCalledTimes(asked);
    });

    it('keeps every preview on an app that pages by cursor, which cannot ask for a page again', async () => {
        const photos = jest
            .fn()
            .mockResolvedValueOnce(
                page(
                    Array.from({ length: 60 }, (_, i) => `a${i}`),
                    'c1'
                )
            )
            .mockResolvedValue(page(Array.from({ length: 60 }, (_, i) => `b${i}`)));
        const { result } = setup(fakeLibrary({ photos }));
        act(() => result.current.openGrid());
        await waitFor(() => expect(result.current.count).toBe(120));
        await act(async () => result.current.setVisibleRange({ start: 110, end: 120, thumbSize: 400 }));

        expect(result.current.photoAt(0)?.src).toBe('data:a0');
        expect(result.current.photoAt(119)?.src).toBe('data:b59');
    });

    it('says the first page is loading until it lands, and not for the pages after it', async () => {
        let release: (value: OnListPhotosPayload) => void = () => undefined;
        const photos = jest
            .fn()
            .mockImplementationOnce(() => new Promise(resolve => (release = resolve)))
            .mockImplementation(async ({ offset = 0, limit }: { offset?: number; limit: number }) =>
                offsetPage(offset, 500, Math.min(limit, 500 - offset))
            );
        const { result } = setup(fakeLibrary({ photos }));

        act(() => result.current.openGrid());
        expect(result.current.loading).toBe(true);

        await act(async () => release(offsetPage(0, 500)));
        expect(result.current.loading).toBe(false);

        act(() => result.current.setVisibleRange({ start: 300, end: 330, thumbSize: 400 }));
        expect(result.current.loading).toBe(false);
    });

    it('retries a failed first page once after a pause, the skeleton up meanwhile, then stops saying loading', async () => {
        jest.useFakeTimers();
        try {
            const photos = jest.fn().mockRejectedValue(new Error('x'));
            const { result } = setup(fakeLibrary({ photos }));

            act(() => result.current.openGrid());
            await act(async () => undefined);
            expect(photos).toHaveBeenCalledTimes(1);
            expect(result.current.loading).toBe(true);

            await act(async () => void jest.advanceTimersByTime(FIRST_PAGE_RETRY_MS));
            await act(async () => undefined);
            expect(photos).toHaveBeenCalledTimes(2);
            expect(result.current.loading).toBe(false);

            await act(async () => void jest.advanceTimersByTime(FIRST_PAGE_RETRY_MS * 4));
            expect(photos).toHaveBeenCalledTimes(2);
        } finally {
            jest.useRealTimers();
        }
    });

    it('lays out the first page that lands on its retry', async () => {
        jest.useFakeTimers();
        try {
            const photos = jest
                .fn()
                .mockRejectedValueOnce(new Error('x'))
                .mockImplementation(async ({ offset = 0, limit }: { offset?: number; limit: number }) =>
                    offsetPage(offset, 10, Math.min(limit, 10 - offset))
                );
            const { result } = setup(fakeLibrary({ photos }));

            act(() => result.current.openGrid());
            await act(async () => undefined);
            await act(async () => void jest.advanceTimersByTime(FIRST_PAGE_RETRY_MS));
            await act(async () => undefined);

            expect(result.current.count).toBe(10);
            expect(result.current.loading).toBe(false);
        } finally {
            jest.useRealTimers();
        }
    });

    // A failed rest of page 0, then a jump far away: the first 24 previews are let go with page 0.
    it('asks for page 0 whole on the way back when its short first page was let go', async () => {
        const photos = jest.fn(async ({ offset = 0, limit }: { offset?: number; limit: number }) => {
            if (offset === FIRST_PAGE_SIZE) throw new Error('timeout');
            return offsetPage(offset, 1000, Math.min(limit, 1000 - offset));
        });
        const { result } = setup(fakeLibrary({ photos }));
        act(() => result.current.openGrid());
        await waitFor(() => expect(result.current.photoAt(0)?.src).toBe('data:t0'));
        await act(async () => undefined);

        await act(async () => result.current.setVisibleRange({ start: 600, end: 630, thumbSize: 400 }));
        await waitFor(() => expect(result.current.photoAt(600)?.src).toBe('data:t600'));
        await act(async () => result.current.setVisibleRange({ start: 0, end: 30, thumbSize: 400 }));

        await waitFor(() => expect(result.current.photoAt(0)?.src).toBe('data:t0'));
        expect(photos).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0, limit: PAGE_SIZE }));
    });

    // A pinch to two columns while the short first page is out: the rest of page 0 goes at the new size.
    it('asks page 0 again when its first previews came at a smaller size than the rest', async () => {
        let releaseFirst: () => void = () => undefined;
        const photos = jest.fn(
            ({ offset = 0, limit }: { offset?: number; limit: number; thumbSize?: number }) =>
                new Promise<OnListPhotosPayload>(resolve => {
                    const answer = () => resolve(offsetPage(offset, 1000, Math.min(limit, 1000 - offset)));
                    if (offset === 0 && limit === FIRST_PAGE_SIZE) releaseFirst = answer;
                    else answer();
                })
        );
        const { result } = setup(fakeLibrary({ photos }));
        act(() => result.current.openGrid());
        act(() => result.current.setVisibleRange({ start: 0, end: 30, thumbSize: 752 }));
        await act(async () => releaseFirst());

        await waitFor(() =>
            expect(photos).toHaveBeenCalledWith(expect.objectContaining({ offset: FIRST_PAGE_SIZE, thumbSize: 752 }))
        );
        // Page 0's first 24 came at the earlier size: the whole page is asked for again at the new one.
        await waitFor(() =>
            expect(photos).toHaveBeenCalledWith(
                expect.objectContaining({ offset: 0, limit: PAGE_SIZE, thumbSize: 752 })
            )
        );
    });

    // A shell that answers some other offset than the one asked for, at the same count, moves nothing on.
    it('does not ask again at once for a page answered at another offset', async () => {
        const photos = jest.fn().mockResolvedValue(offsetPage(0, 500));
        const { result } = setup(fakeLibrary({ photos }));

        act(() => result.current.openGrid());
        await waitFor(() => expect(result.current.count).toBe(500));
        await act(async () => undefined);
        await act(async () => undefined);

        // The short first page, then the rest of page 0 — answered at offset 0 again, which stops there.
        expect(photos).toHaveBeenCalledTimes(2);
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
        expect(library.photos).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0, limit: FIRST_PAGE_SIZE }));
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

describe('keptPages', () => {
    it('keeps the visible pages and two either side', () => {
        expect(keptPages({ range: { start: 600, end: 640 }, total: 3000 })).toEqual({ first: 8, last: 12 });
    });

    it('stops at either end of the list', () => {
        expect(keptPages({ range: { start: 0, end: 30 }, total: 3000 })).toEqual({ first: 0, last: 2 });
        expect(keptPages({ range: { start: 2990, end: 3000 }, total: 3000 })).toEqual({ first: 47, last: 49 });
    });

    it('keeps the first page of an empty or not yet measured range', () => {
        expect(keptPages({ range: { start: 0, end: 0 }, total: 3000 })).toEqual({ first: 0, last: 2 });
        expect(keptPages({ range: { start: 0, end: 60 }, total: 0 })).toEqual({ first: 0, last: 0 });
    });
});

describe('pageAhead', () => {
    const range = { start: 70, end: 130, thumbSize: 400 };

    it('is the page just past the range in the direction of the scroll', () => {
        expect(pageAhead({ range, total: 1000, loaded: new Map(), direction: 1 })).toBe(3);
        expect(pageAhead({ range, total: 1000, loaded: new Map(), direction: -1 })).toBe(0);
    });

    it('is nothing when that page has loaded at a good enough size, or lies past either end', () => {
        expect(pageAhead({ range, total: 1000, loaded: new Map([[3, 400]]), direction: 1 })).toBeUndefined();
        expect(pageAhead({ range, total: 180, loaded: new Map(), direction: 1 })).toBeUndefined();
        expect(
            pageAhead({ range: { start: 0, end: 30 }, total: 1000, loaded: new Map(), direction: -1 })
        ).toBeUndefined();
    });

    it('asks again for a page ahead loaded too small for the tiles now', () => {
        expect(
            pageAhead({ range: { ...range, thumbSize: 600 }, total: 1000, loaded: new Map([[3, 400]]), direction: 1 })
        ).toBe(3);
    });
});

describe('offsetRequest', () => {
    const base = { total: 1000, loaded: new Map<number, number>(), direction: 1 as const, firstPagePartial: false };

    it('asks for a page the range needs before the one ahead', () => {
        expect(offsetRequest({ ...base, range: { start: 70, end: 100 } })).toEqual({ offset: 60, limit: PAGE_SIZE });
        expect(offsetRequest({ ...base, range: { start: 70, end: 100 }, loaded: new Map([[1, 400]]) })).toEqual({
            offset: 120,
            limit: PAGE_SIZE,
        });
    });

    it('completes page 0 from where the short first page stopped', () => {
        expect(offsetRequest({ ...base, range: { start: 0, end: 30 }, firstPagePartial: true })).toEqual({
            offset: FIRST_PAGE_SIZE,
            limit: PAGE_SIZE - FIRST_PAGE_SIZE,
        });
    });

    it('asks for nothing once the range and the page ahead are in', () => {
        const loaded = new Map([
            [0, 400],
            [1, 400],
        ]);
        expect(offsetRequest({ ...base, range: { start: 0, end: 30 }, loaded })).toBeUndefined();
    });
});
