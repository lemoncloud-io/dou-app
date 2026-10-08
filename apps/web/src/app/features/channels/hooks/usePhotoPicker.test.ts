import { act, renderHook, waitFor } from '@testing-library/react';

import type { OnListPhotosPayload } from '@chatic/app-messages';
import { IDENTITY_PHOTO_EDIT, type PhotoEdit } from '@chatic/web-ui-kit';

import type { PhotoLibrary } from '../../../bridge/photoLibrary';
import type { EditRendition } from '../utils/bakePhotoEdit';
import {
    editsDiffer,
    FIRST_PAGE_RETRY_MS,
    FIRST_PAGE_SIZE,
    keptPages,
    needsSharperThumbs,
    offsetRequest,
    PAGE_SIZE,
    pageAhead,
    pageToLoad,
    RECENT_COUNT,
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

    it('probes for the thirty newest items to pick from in the panel', async () => {
        const library = fakeLibrary({ photos: jest.fn().mockResolvedValue(page(['a', 'b', 'c', 'd'])) });
        const { result } = setup(library);

        await act(() => result.current.probe());

        expect(RECENT_COUNT).toBe(30);
        expect(library.photos).toHaveBeenCalledWith({ limit: 30, thumbSize: expect.any(Number) });
        expect(result.current.supported).toBe(true);
        expect(result.current.recent.map(p => p.id)).toEqual(['a', 'b', 'c', 'd']);
        expect(result.current.recent[0].src).toBe('data:a');
    });

    // The panel's recent row and the grid pick into one list: "see all" opens the grid on it.
    it('opens the grid on the pick already made in the panel, and loads the first page and the albums', async () => {
        const library = fakeLibrary();
        const { result } = setup(library);
        await act(() => result.current.probe());
        act(() => result.current.toggle(result.current.recent[1]));

        act(() => result.current.openGrid());

        await waitFor(() => expect(gridIds(result.current)).toEqual(['a', 'b', 'c']));
        expect(result.current.gridOpen).toBe(true);
        expect(result.current.picked).toEqual([{ id: 'b', src: 'data:b' }]);
        await waitFor(() => expect(result.current.albums).toHaveLength(1));
        // Picked on in the grid, after it in order.
        act(() => result.current.toggle({ id: 'c', src: 'data:c' }));
        expect(result.current.picked.map(p => p.id)).toEqual(['b', 'c']);
    });

    it('goes back to the panel with the pick when the grid closes, and opens on it again', () => {
        const { result } = setup(fakeLibrary());
        act(() => result.current.openGrid());
        act(() => result.current.toggle({ id: 'a', src: 'data:a' }));

        act(() => result.current.closeGrid());
        expect(result.current.gridOpen).toBe(false);
        expect(result.current.picked.map(p => p.id)).toEqual(['a']);

        act(() => result.current.openGrid());
        expect(result.current.picked.map(p => p.id)).toEqual(['a']);
    });

    it('lets the whole pick go when it is cleared', () => {
        const { result } = setup(fakeLibrary());
        act(() => result.current.toggle({ id: 'a', src: 'data:a' }));
        act(() => result.current.toggle({ id: 'b', src: 'data:b' }));

        act(() => result.current.clearPicked());

        expect(result.current.picked).toEqual([]);
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

        act(() => result.current.toggle({ id: 'x', src: '' }));
        act(() => result.current.openGrid());
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
        act(() => result.current.clearPicked());
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

describe('usePhotoPicker — editing before the send', () => {
    const turned: PhotoEdit = { ...IDENTITY_PHOTO_EDIT, rotation: 90 };
    const cropped: PhotoEdit = { ...IDENTITY_PHOTO_EDIT, crop: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 } };

    /** Reads that wait until a test lets them land, so what happens meanwhile can be checked. */
    const heldReads = () => {
        const waiting = new Map<string, { resolve: (file: File) => void; reject: (error: unknown) => void }>();
        const read = jest.fn(
            ({ id }: { id: string }) => new Promise<File>((resolve, reject) => waiting.set(id, { resolve, reject }))
        );
        const land = (id: string, type = 'image/jpeg') =>
            act(async () => {
                waiting.get(id)?.resolve(new File([id], `${id}.${type === 'image/gif' ? 'gif' : 'jpg'}`, { type }));
            });
        const fail = (id: string) =>
            act(async () => {
                waiting.get(id)?.reject(Object.assign(new Error(id), { code: 'READ_FAILED' }));
            });
        return { read, land, fail };
    };

    const rendition = jest.fn(
        async (file: File): Promise<EditRendition | null> => ({ src: `blob:${file.name}`, width: 400, height: 300 })
    );
    const bake = jest.fn(
        async (file: File): Promise<File | null> =>
            new File([file.name], file.name.replace('.', '-edit.'), { type: file.type })
    );

    const setupEditing = (library: PhotoLibrary) =>
        renderHook(() => usePhotoPicker({ max: 10, allTitle: '최근 항목', library, bake, rendition }));

    /** Opens the grid and picks these, in order. */
    const pickAll = (
        result: { current: ReturnType<typeof usePhotoPicker> },
        items: Array<{ id: string; kind?: 'video' }>
    ) => {
        act(() => result.current.openGrid());
        for (const item of items) act(() => result.current.toggle({ src: `data:${item.id}`, ...item }));
    };

    beforeEach(() => {
        rendition.mockClear();
        bake.mockClear();
        URL.revokeObjectURL = jest.fn();
    });

    it('reads one photo at a time for the editor, the one asked for first, and makes its copy', async () => {
        const reads = heldReads();
        const { result } = setupEditing(fakeLibrary({ read: reads.read }));
        pickAll(result, [{ id: 'a' }, { id: 'b' }]);

        act(() => result.current.loadForEdit('b', 'a'));

        expect(reads.read).toHaveBeenCalledTimes(1);
        expect(reads.read).toHaveBeenLastCalledWith({ id: 'b' });
        expect(result.current.editAssets.get('b')).toEqual({ status: 'loading', editable: true });

        await reads.land('b');
        await waitFor(() =>
            expect(result.current.editAssets.get('b')).toEqual({
                status: 'ready',
                editable: true,
                src: 'blob:b.jpg',
                width: 400,
                height: 300,
            })
        );
        expect(reads.read).toHaveBeenLastCalledWith({ id: 'a' });
    });

    // A quick swipe through the pick reads where it stopped, not every photo it passed.
    it('lets newer asks replace what was still waiting, and lets the read under way finish', async () => {
        const reads = heldReads();
        const { result } = setupEditing(fakeLibrary({ read: reads.read }));
        pickAll(result, [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);

        act(() => result.current.loadForEdit('a', 'b'));
        act(() => result.current.loadForEdit('c', 'a'));
        await reads.land('a');
        await waitFor(() => expect(reads.read).toHaveBeenCalledTimes(2));
        await reads.land('c');
        await act(async () => undefined);

        expect(reads.read.mock.calls.map(([item]) => item.id)).toEqual(['a', 'c']);
        expect(result.current.editAssets.has('b')).toBe(false);
    });

    it('reads no video and nothing it already has', async () => {
        const reads = heldReads();
        const { result } = setupEditing(fakeLibrary({ read: reads.read }));
        pickAll(result, [{ id: 'a' }, { id: 'v', kind: 'video' }]);

        act(() => result.current.loadForEdit('v', 'a', 'not-picked'));
        await reads.land('a');
        await waitFor(() => expect(result.current.editAssets.get('a')?.status).toBe('ready'));
        act(() => result.current.loadForEdit('a', 'v'));

        expect(reads.read).toHaveBeenCalledTimes(1);
        expect(result.current.editAssets.has('v')).toBe(false);
    });

    it('marks a GIF as shown but not editable', async () => {
        const reads = heldReads();
        const { result } = setupEditing(fakeLibrary({ read: reads.read }));
        pickAll(result, [{ id: 'g' }]);

        act(() => result.current.loadForEdit('g'));
        await reads.land('g', 'image/gif');

        await waitFor(() =>
            expect(result.current.editAssets.get('g')).toMatchObject({ status: 'ready', editable: false })
        );
    });

    it('marks a photo it could not read or decode as failed, and sends a decoded-less one as read', async () => {
        const reads = heldReads();
        const { result } = setupEditing(fakeLibrary({ read: reads.read }));
        pickAll(result, [{ id: 'a' }, { id: 'b' }]);
        rendition.mockResolvedValueOnce(null);

        act(() => result.current.loadForEdit('a', 'b'));
        await reads.fail('a');
        await waitFor(() => expect(result.current.editAssets.get('a')).toEqual({ status: 'failed', editable: true }));
        await reads.land('b');
        await waitFor(() => expect(result.current.editAssets.get('b')).toEqual({ status: 'failed', editable: true }));

        // The send reads `a` again; `b` was read and is not.
        let taking: Promise<PickedFromGrid> = Promise.resolve({ items: [], refused: [] });
        act(() => {
            taking = result.current.takePicked();
        });
        await reads.land('a');
        const picked = await taking;
        expect(reads.read.mock.calls.map(([item]) => item.id)).toEqual(['a', 'b', 'a']);
        expect(picked.items.map(item => item.name)).toEqual(['a.jpg', 'b.jpg']);
    });

    it('drops a read whose photo was unpicked while it was out', async () => {
        const reads = heldReads();
        const { result } = setupEditing(fakeLibrary({ read: reads.read }));
        pickAll(result, [{ id: 'a' }, { id: 'b' }]);

        act(() => result.current.loadForEdit('a'));
        act(() => result.current.toggle({ id: 'a', src: 'data:a' }));
        await reads.land('a');
        await act(async () => undefined);

        expect(result.current.editAssets.has('a')).toBe(false);
        expect(rendition).not.toHaveBeenCalled();
    });

    it('drops an edit, and lets go of the copy, when its photo is unpicked', async () => {
        const reads = heldReads();
        const { result } = setupEditing(fakeLibrary({ read: reads.read }));
        pickAll(result, [{ id: 'a' }]);
        act(() => result.current.loadForEdit('a'));
        await reads.land('a');
        await waitFor(() => expect(result.current.editAssets.get('a')?.status).toBe('ready'));
        act(() => result.current.setEdit('a', turned));

        act(() => result.current.toggle({ id: 'a', src: 'data:a' }));

        expect(result.current.edits.size).toBe(0);
        expect(result.current.editAssets.size).toBe(0);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:a.jpg');
        // Picked again, it starts unedited and is read afresh.
        act(() => result.current.toggle({ id: 'a', src: 'data:a' }));
        act(() => result.current.loadForEdit('a'));
        expect(reads.read).toHaveBeenCalledTimes(2);
    });

    it('draws an edited photo in the strip once its copy is there and the edit changes something', async () => {
        const reads = heldReads();
        const { result } = setupEditing(fakeLibrary({ read: reads.read }));
        pickAll(result, [{ id: 'a' }, { id: 'b' }]);

        act(() => result.current.setEdit('a', turned));
        expect(result.current.picked[0]).toEqual({ id: 'a', src: 'data:a' });

        act(() => result.current.loadForEdit('a'));
        await reads.land('a');
        await waitFor(() =>
            expect(result.current.picked[0]).toEqual({
                id: 'a',
                src: 'data:a',
                edited: { src: 'blob:a.jpg', width: 400, height: 300, edit: turned },
            })
        );
        expect(result.current.picked[1]).toEqual({ id: 'b', src: 'data:b' });
    });

    it('forgets an edit that changes nothing, and keeps edits only for photos still picked', () => {
        const { result } = setupEditing(fakeLibrary());
        pickAll(result, [{ id: 'a' }]);

        act(() => result.current.setEdit('a', turned));
        act(() => result.current.setEdit('gone', turned));
        expect([...result.current.edits.keys()]).toEqual(['a']);

        act(() => result.current.setEdit('a', { ...IDENTITY_PHOTO_EDIT, aspect: 'original' }));
        expect(result.current.edits.size).toBe(0);
    });

    it('puts back the edits taken earlier', () => {
        const { result } = setupEditing(fakeLibrary());
        pickAll(result, [{ id: 'a' }, { id: 'b' }]);
        act(() => result.current.setEdit('a', turned));
        const snapshot = result.current.edits;

        act(() => result.current.setEdit('a', cropped));
        act(() => result.current.setEdit('b', turned));
        act(() => result.current.restoreEdits(snapshot));

        expect([...result.current.edits]).toEqual([['a', turned]]);
    });

    it('reuses the bytes the editor read, and draws only the edited photos, one at a time in pick order', async () => {
        const calls: string[] = [];
        const library = fakeLibrary({
            read: jest.fn(async ({ id }) => {
                calls.push(`read ${id}`);
                return new File([id], `${id}.jpg`, { type: 'image/jpeg' });
            }),
        });
        bake.mockImplementation(async (file: File) => {
            calls.push(`bake ${file.name}`);
            return new File([file.name], file.name.replace('.', '-edit.'), { type: file.type });
        });
        const { result } = setupEditing(library);
        pickAll(result, [{ id: 'a' }, { id: 'v', kind: 'video' }, { id: 'b' }, { id: 'c' }]);
        act(() => result.current.loadForEdit('b'));
        await waitFor(() => expect(result.current.editAssets.get('b')?.status).toBe('ready'));
        act(() => result.current.setEdit('a', cropped));
        act(() => result.current.setEdit('b', turned));

        let picked: PickedFromGrid = { items: [], refused: [] };
        await act(async () => {
            picked = await result.current.takePicked();
        });

        expect(calls).toEqual(['read b', 'read a', 'bake a.jpg', 'bake b.jpg', 'read c']);
        expect(bake).toHaveBeenNthCalledWith(1, expect.objectContaining({ name: 'a.jpg' }), cropped);
        expect(picked.items.map(item => item.name)).toEqual(['a-edit.jpg', 'v.mp4', 'b-edit.jpg', 'c.jpg']);
        expect(picked.editFailed).toBeUndefined();
    });

    it('refuses an edited photo alone when its edit cannot be drawn, and counts it', async () => {
        bake.mockResolvedValueOnce(null);
        const { result } = setupEditing(fakeLibrary());
        pickAll(result, [{ id: 'a' }, { id: 'b' }]);
        act(() => result.current.setEdit('a', turned));

        let picked: PickedFromGrid = { items: [], refused: [] };
        await act(async () => {
            picked = await result.current.takePicked();
        });

        expect(picked.items.map(item => item.name)).toEqual(['b.jpg']);
        expect(picked.refused).toEqual([]);
        expect(picked.editFailed).toBe(1);
    });

    it('sends a GIF as read, whatever edit was recorded for it', async () => {
        const library = fakeLibrary({ read: jest.fn(async () => new File(['g'], 'g.gif', { type: 'image/gif' })) });
        const { result } = setupEditing(library);
        pickAll(result, [{ id: 'g' }]);
        act(() => result.current.setEdit('g', turned));

        let picked: PickedFromGrid = { items: [], refused: [] };
        await act(async () => {
            picked = await result.current.takePicked();
        });

        expect(bake).not.toHaveBeenCalled();
        expect(picked.items.map(item => item.name)).toEqual(['g.gif']);
    });

    it('lets the editor’s read under way finish before the send reads, and does not read it twice', async () => {
        const reads = heldReads();
        const { result } = setupEditing(fakeLibrary({ read: reads.read }));
        pickAll(result, [{ id: 'a' }, { id: 'b' }]);
        act(() => result.current.loadForEdit('a', 'b'));

        let taking: Promise<PickedFromGrid> = Promise.resolve({ items: [], refused: [] });
        act(() => {
            taking = result.current.takePicked();
        });
        // Nothing more for the editor once the send has started.
        act(() => result.current.loadForEdit('b'));
        expect(reads.read).toHaveBeenCalledTimes(1);

        await reads.land('a');
        await waitFor(() => expect(reads.read).toHaveBeenCalledTimes(2));
        await reads.land('b');
        const picked = await taking;

        expect(reads.read.mock.calls.map(([item]) => item.id)).toEqual(['a', 'b']);
        // The send needs the bytes, not a copy for an editor that has closed.
        expect(rendition).not.toHaveBeenCalled();
        expect(picked.items.map(item => item.name)).toEqual(['a.jpg', 'b.jpg']);
    });

    it('waits for the editor’s read of a picked photo later in the pick before reading any other', async () => {
        const reads = heldReads();
        const { result } = setupEditing(fakeLibrary({ read: reads.read }));
        pickAll(result, [{ id: 'a' }, { id: 'b' }]);
        act(() => result.current.loadForEdit('b'));

        let taking: Promise<PickedFromGrid> = Promise.resolve({ items: [], refused: [] });
        act(() => {
            taking = result.current.takePicked();
        });
        await act(async () => undefined);
        // `a` waits: reading it beside `b` would hold two photos' base64 at once.
        expect(reads.read).toHaveBeenCalledTimes(1);

        await reads.land('b');
        await waitFor(() => expect(reads.read).toHaveBeenCalledTimes(2));
        await reads.land('a');
        const picked = await taking;

        expect(reads.read.mock.calls.map(([item]) => item.id)).toEqual(['b', 'a']);
        expect(picked.items.map(item => item.name)).toEqual(['a.jpg', 'b.jpg']);
    });

    // An iCloud original can take the shell's whole read timeout; the send has no use for it.
    it('does not wait for the editor’s read of a photo unpicked since', async () => {
        const read = jest.fn(({ id }: { id: string }) =>
            id === 'a'
                ? new Promise<File>(() => undefined)
                : Promise.resolve(new File([id], `${id}.jpg`, { type: 'image/jpeg' }))
        );
        const { result } = setupEditing(fakeLibrary({ read }));
        pickAll(result, [{ id: 'a' }, { id: 'b' }]);
        act(() => result.current.loadForEdit('a'));
        act(() => result.current.toggle({ id: 'a', src: 'data:a' }));

        let taking: Promise<PickedFromGrid> = Promise.resolve({ items: [], refused: [] });
        act(() => {
            taking = result.current.takePicked();
        });
        await waitFor(() => expect(result.current.preparing).toBe(false));

        expect((await taking).items.map(item => item.name)).toEqual(['b.jpg']);
        expect(read.mock.calls.map(([item]) => item.id)).toEqual(['a', 'b']);
    });

    it('does not wait for the copy the editor is making, uses the bytes under it, and revokes it as it lands', async () => {
        let finishCopy: (copy: EditRendition) => void = () => undefined;
        rendition.mockImplementationOnce(
            () =>
                new Promise<EditRendition>(resolve => {
                    finishCopy = resolve;
                })
        );
        const library = fakeLibrary();
        const { result } = setupEditing(library);
        pickAll(result, [{ id: 'a' }, { id: 'b' }]);
        act(() => result.current.loadForEdit('a'));
        await waitFor(() => expect(rendition).toHaveBeenCalledTimes(1));

        let taking: Promise<PickedFromGrid> = Promise.resolve({ items: [], refused: [] });
        act(() => {
            taking = result.current.takePicked();
        });
        await waitFor(() => expect(result.current.preparing).toBe(false));

        expect((await taking).items.map(item => item.name)).toEqual(['a.jpg', 'b.jpg']);
        // `a` was read once, for the editor; the send used those bytes.
        expect((library.read as jest.Mock).mock.calls.map(([item]) => item.id)).toEqual(['a', 'b']);
        await act(async () => finishCopy({ src: 'blob:late', width: 400, height: 300 }));
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:late');
        expect(result.current.editAssets.size).toBe(0);
    });

    it('drops what was waiting when asked for nothing, and lets the read under way finish', async () => {
        const reads = heldReads();
        const { result } = setupEditing(fakeLibrary({ read: reads.read }));
        pickAll(result, [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
        act(() => result.current.loadForEdit('a', 'b', 'c'));

        // What the editor asks once it has closed.
        act(() => result.current.loadForEdit());
        await reads.land('a');
        await waitFor(() => expect(result.current.editAssets.get('a')?.status).toBe('ready'));
        await act(async () => undefined);

        expect(reads.read).toHaveBeenCalledTimes(1);
        expect(result.current.editAssets.has('b')).toBe(false);
    });

    // The old read is dropped when it lands — its pick is gone — so waiting on it would leave the photo
    // without a copy for good.
    it('reads a photo again for a new pick while an earlier pick’s read of it is still out', async () => {
        const reads = heldReads();
        const { result } = setupEditing(fakeLibrary({ read: reads.read }));
        pickAll(result, [{ id: 'a' }]);
        act(() => result.current.loadForEdit('a'));
        act(() => result.current.clearPicked());
        pickAll(result, [{ id: 'a' }]);

        act(() => result.current.loadForEdit('a'));
        await reads.land('a');
        await waitFor(() => expect(reads.read).toHaveBeenCalledTimes(2));
        await reads.land('a');

        await waitFor(() => expect(result.current.editAssets.get('a')?.status).toBe('ready'));
        expect(rendition).toHaveBeenCalledTimes(1);
    });

    it('lets go of everything read for the pick when it is cleared', async () => {
        const reads = heldReads();
        const { result } = setupEditing(fakeLibrary({ read: reads.read }));
        pickAll(result, [{ id: 'a' }, { id: 'b' }]);
        act(() => result.current.loadForEdit('a', 'b'));
        await reads.land('a');
        await waitFor(() => expect(result.current.editAssets.get('a')?.status).toBe('ready'));
        act(() => result.current.setEdit('a', turned));

        act(() => result.current.clearPicked());
        // `b` was on its way; it lands for a pick that is gone.
        await reads.land('b');
        await act(async () => undefined);

        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:a.jpg');
        expect(result.current.editAssets.size).toBe(0);
        expect(result.current.edits.size).toBe(0);
        expect(rendition).toHaveBeenCalledTimes(1);
    });

    // The pick goes back to the panel, where the composer's send can still send it as edited.
    it('keeps the pick, its edits and copies when the grid closes, and reads the photos again at the send', async () => {
        const reads = heldReads();
        const { result } = setupEditing(fakeLibrary({ read: reads.read }));
        pickAll(result, [{ id: 'a' }, { id: 'b' }]);
        act(() => result.current.loadForEdit('a'));
        await reads.land('a');
        await waitFor(() => expect(result.current.editAssets.get('a')?.status).toBe('ready'));
        act(() => result.current.setEdit('a', turned));

        act(() => result.current.closeGrid());

        expect(URL.revokeObjectURL).not.toHaveBeenCalled();
        expect(result.current.picked.map(p => p.id)).toEqual(['a', 'b']);
        expect([...result.current.edits]).toEqual([['a', turned]]);
        expect(result.current.editAssets.get('a')?.status).toBe('ready');
        expect(result.current.picked[0].edited?.edit).toEqual(turned);
        expect(reads.read).toHaveBeenCalledTimes(1);

        let taking: Promise<PickedFromGrid> = Promise.resolve({ items: [], refused: [] });
        act(() => {
            taking = result.current.takePicked();
        });
        // The bytes went with the grid: `a` is read again, then `b`, and `a` is drawn with its edit.
        await waitFor(() => expect(reads.read).toHaveBeenCalledTimes(2));
        expect(reads.read).toHaveBeenLastCalledWith({ id: 'a', src: 'data:a' });
        await reads.land('a');
        await waitFor(() => expect(reads.read).toHaveBeenCalledTimes(3));
        await reads.land('b');
        let picked: PickedFromGrid = { items: [], refused: [] };
        await act(async () => {
            picked = await taking;
        });

        expect(bake).toHaveBeenCalledWith(expect.objectContaining({ name: 'a.jpg' }), turned);
        expect(picked.items.map(item => item.name)).toEqual(['a-edit.jpg', 'b.jpg']);
    });

    // An editor opened from the composer's row, with the grid closed, reads as the grid's does; the
    // bytes then go as it closes, and the pick waits on as edited.
    it('reads for an editor with the grid closed, and lets only the bytes go when they are released', async () => {
        const reads = heldReads();
        const { result } = setupEditing(fakeLibrary({ read: reads.read }));
        pickAll(result, [{ id: 'a' }, { id: 'b' }]);
        act(() => result.current.closeGrid());

        act(() => result.current.loadForEdit('a', 'b'));
        // Released with `a` under way and `b` waiting: `a` finishes, `b` is not read.
        act(() => result.current.releaseBytes());
        await reads.land('a');
        await waitFor(() => expect(result.current.editAssets.get('a')?.status).toBe('ready'));
        await act(async () => undefined);
        expect(reads.read).toHaveBeenCalledTimes(1);
        act(() => result.current.setEdit('a', turned));

        // And released again once `a` is in: its bytes go, its copy and its edit stay.
        act(() => result.current.releaseBytes());
        expect(result.current.picked.map(p => p.id)).toEqual(['a', 'b']);
        expect(result.current.picked[0].edited?.edit).toEqual(turned);
        expect(URL.revokeObjectURL).not.toHaveBeenCalled();

        let taking: Promise<PickedFromGrid> = Promise.resolve({ items: [], refused: [] });
        act(() => {
            taking = result.current.takePicked();
        });
        await waitFor(() => expect(reads.read).toHaveBeenCalledTimes(2));
        expect(reads.read).toHaveBeenLastCalledWith({ id: 'a', src: 'data:a' });
        await reads.land('a');
        await waitFor(() => expect(reads.read).toHaveBeenCalledTimes(3));
        await reads.land('b');
        await act(async () => {
            await taking;
        });
        expect(bake).toHaveBeenCalledWith(expect.objectContaining({ name: 'a.jpg' }), turned);
    });

    it('keeps the bytes a send is using, whatever asks for them to go meanwhile', async () => {
        const reads = heldReads();
        const { result } = setupEditing(fakeLibrary({ read: reads.read }));
        pickAll(result, [{ id: 'a' }, { id: 'b' }]);
        act(() => result.current.loadForEdit('b'));
        await reads.land('b');
        await waitFor(() => expect(result.current.editAssets.get('b')?.status).toBe('ready'));

        let taking: Promise<PickedFromGrid> = Promise.resolve({ items: [], refused: [] });
        act(() => {
            taking = result.current.takePicked();
        });
        await waitFor(() => expect(reads.read).toHaveBeenCalledTimes(2));
        act(() => result.current.releaseBytes());
        await reads.land('a');
        let picked: PickedFromGrid = { items: [], refused: [] };
        await act(async () => {
            picked = await taking;
        });

        // `b` went from the editor's read: it was not read a second time.
        expect(reads.read).toHaveBeenCalledTimes(2);
        expect(picked.items.map(item => item.name)).toEqual(['a.jpg', 'b.jpg']);
    });

    it('lets go of everything read for the pick once it is sent', async () => {
        const reads = heldReads();
        const { result } = setupEditing(fakeLibrary({ read: reads.read }));
        pickAll(result, [{ id: 'a' }]);
        act(() => result.current.loadForEdit('a'));
        await reads.land('a');
        await waitFor(() => expect(result.current.editAssets.get('a')?.status).toBe('ready'));

        await act(async () => {
            await result.current.takePicked();
        });

        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:a.jpg');
        expect(result.current.editAssets.size).toBe(0);
    });

    it('revokes the editor copies when the screen goes away', async () => {
        const reads = heldReads();
        const { result, unmount } = setupEditing(fakeLibrary({ read: reads.read }));
        pickAll(result, [{ id: 'a' }]);
        act(() => result.current.loadForEdit('a'));
        await reads.land('a');
        await waitFor(() => expect(result.current.editAssets.get('a')?.status).toBe('ready'));

        unmount();

        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:a.jpg');
    });
});

describe('editsDiffer', () => {
    const turned: PhotoEdit = { ...IDENTITY_PHOTO_EDIT, rotation: 90 };

    it('is false for the same edits, held or copied', () => {
        const a = new Map([['p', turned]]);
        expect(editsDiffer(a, a)).toBe(false);
        expect(editsDiffer(a, new Map([['p', { ...turned, crop: { ...turned.crop } }]]))).toBe(false);
        expect(editsDiffer(new Map(), new Map())).toBe(false);
    });

    it('is true for an edit added, removed or changed — the aspect preset included', () => {
        const a = new Map([['p', turned]]);
        expect(editsDiffer(a, new Map())).toBe(true);
        expect(editsDiffer(new Map(), a)).toBe(true);
        expect(editsDiffer(a, new Map([['q', turned]]))).toBe(true);
        expect(editsDiffer(a, new Map([['p', { ...turned, flipH: true }]]))).toBe(true);
        expect(editsDiffer(a, new Map([['p', { ...turned, aspect: '1:1' as const }]]))).toBe(true);
        expect(editsDiffer(a, new Map([['p', { ...turned, crop: { ...turned.crop, width: 0.5 } }]]))).toBe(true);
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
