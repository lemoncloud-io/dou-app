import { useCallback, useRef, useState } from 'react';

import type {
    OnListPhotosPayload,
    PhotoLibraryAccess,
    PhotoLibraryItem,
    RefusedAttachment,
} from '@chatic/app-messages';
import type { ChatAttachmentSource } from '@chatic/data';
import {
    gridMetrics,
    thumbPixelSize,
    type PhotoAlbum,
    type PhotoGridRange,
    type PhotoItem,
    type PhotoItemKind,
} from '@chatic/web-ui-kit';

import { photoLibrary, photoPreviewSrc, type PhotoLibrary } from '../../../bridge/photoLibrary';

/** How many previews the attach menu shows before "see all". */
const RECENT_COUNT = 4;
/** The attach menu's preview tile, and the album list's cover, in CSS pixels. */
const RECENT_TILE = 90;
const COVER_TILE = 64;
/** One page of the grid. Pages by offset start at multiples of it, so a page is also an index. */
export const PAGE_SIZE = 60;
/**
 * The first page is shorter: about a screen at three columns. The first screen waits on it, and the
 * shell makes previews one after another, so a page of 60 kept that screen waiting on 36 it does not
 * show. On an offset list the rest of page 0 follows as its own request.
 */
export const FIRST_PAGE_SIZE = 24;
/**
 * How long a failed first page waits before its one retry. The first page is what the grid opens on:
 * with nothing laid out there is no range to change, so without a retry a single slow or failed round
 * trip would leave the grid empty, looking like an album with nothing in it.
 */
export const FIRST_PAGE_RETRY_MS = 1500;
/**
 * How many pages either side of the visible ones keep their previews, on a list laid out by offset.
 * Two is about seven screens at three columns — a scroll back over that is drawn from memory — and
 * caps what the grid holds at a few hundred previews however far it has been scrolled.
 */
export const KEEP_PAGES = 2;

export interface PhotoPicker {
    /**
     * Whether this shell has the in-app picker: `null` until the first probe answers. False in a
     * browser and in an app built before the picker, where the page's own file input is used instead.
     */
    supported: boolean | null;
    access: PhotoLibraryAccess | null;
    recent: PhotoItem[];
    /** Asks the shell once for the newest photos — call when the attach menu opens. */
    probe(): Promise<void>;

    gridOpen: boolean;
    openGrid(preselect?: PhotoItem): void;
    closeGrid(): void;

    albumsOpen: boolean;
    toggleAlbums(): void;
    albums: PhotoAlbum[];
    album: { id?: string; title: string };
    selectAlbum(id: string): void;

    /**
     * How many photos the grid lays out: the album's whole count on an app that pages by offset, what
     * has loaded so far on one that pages by cursor.
     */
    count: number;
    /**
     * The photo at a grid index, or undefined while its preview has not come — not loaded yet, or let
     * go far from the screen and on its way back — drawn as a skeleton tile.
     */
    photoAt(index: number): PhotoItem | undefined;
    /** Whether the album's first page is on its way: the grid shows skeleton tiles meanwhile. */
    loading: boolean;
    /** What the grid shows now; the pages it needs are asked for, nearest first. */
    setVisibleRange(range: PhotoGridRange): void;

    picked: PhotoItem[];
    toggle(photo: PhotoItem): void;
    /**
     * Reads the picked photos and keeps the picked videos in the shell, one at a time in pick order,
     * then clears the pick and closes the grid. An item that cannot be read or kept is refused alone;
     * the rest still go.
     */
    takePicked(): Promise<PickedFromGrid>;
    /** Whether `takePicked` is still reading — the grid stays open, saying so, until it is done. */
    preparing: boolean;

    /** iOS limited access: let the user share more, then list again. */
    manageSelection(): Promise<void>;
}

/** What the grid hands to the send: what was read or kept, and what was not, in pick order. */
export interface PickedFromGrid {
    items: ChatAttachmentSource[];
    refused: RefusedAttachment[];
}

/**
 * One grid position: which photo it is. Its preview is held apart (in `thumbs`, by id) so the previews
 * of a stretch long scrolled past can be let go later without losing the layout; the ids are small.
 */
interface Slot {
    id: string;
    kind?: PhotoItemKind;
    durationMs?: number;
}

/**
 * How the current album is laid out. `offset`: the app said how many there are, any page can be asked
 * for, and the grid is that tall from the start. `cursor`: an app from before offsets — pages come in
 * order and the grid grows with them. `none`: the first page has not answered yet.
 */
type Layout = 'none' | 'offset' | 'cursor';

const toSlot = (item: PhotoLibraryItem): Slot =>
    item.mediaType === 'video'
        ? { id: item.id, kind: 'video', ...(item.durationMs !== undefined ? { durationMs: item.durationMs } : {}) }
        : { id: item.id };

const toItems = (items: PhotoLibraryItem[]): PhotoItem[] =>
    items.map(item => ({ ...toSlot(item), src: photoPreviewSrc(item.thumbBase64) }));

/** A preview drawn from the shell's base64; an item the shell could make no preview for draws empty. */
const thumbOf = (item: PhotoLibraryItem): string => (item.thumbBase64 ? photoPreviewSrc(item.thumbBase64) : '');

const isVideo = (item: PhotoItem) => item.kind === 'video';

/** How a video the shell would not keep is reported — in the words the attach menu already uses. */
const refusalOf = (error: unknown): RefusedAttachment['reason'] => {
    const code = (error as { code?: string } | null)?.code;
    if (code === 'UNSUPPORTED') return 'unsupported';
    if (code === 'TOO_LARGE') return 'too-large';
    return 'unreadable';
};

const devicePixelRatio = (): number => (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);

/** A tile's preview size, from its CSS size. */
const previewSize = (cssPixels: number): number => thumbPixelSize(cssPixels, devicePixelRatio());

/**
 * Whether previews loaded at `have` pixels look soft at `want`. A fifth of slack: a column step that
 * only grows tiles a little (five columns to four) is not worth asking a page over again for.
 */
export const needsSharperThumbs = (have: number, want: number | undefined): boolean =>
    want !== undefined && have * 1.2 < want;

/**
 * The page to ask for next, on a list laid out by offset: of the pages the visible range touches, the
 * nearest to its middle that has not loaded, or loaded too small for the tiles now. Nearest first,
 * because a fast-scroll drag passes many pages and only the last one it stops at is still wanted.
 * `loaded` maps a page index to the size its previews were asked at.
 */
export const pageToLoad = ({
    range,
    total,
    loaded,
    pageSize = PAGE_SIZE,
}: {
    range: PhotoGridRange;
    total: number;
    loaded: ReadonlyMap<number, number>;
    pageSize?: number;
}): number | undefined => {
    const start = Math.max(0, Math.min(range.start, total));
    const end = Math.max(start, Math.min(range.end, total));
    if (end <= start) return undefined;
    const first = Math.floor(start / pageSize);
    const last = Math.floor((end - 1) / pageSize);
    const middle = (start + end) / 2 / pageSize;
    const pages: number[] = [];
    for (let page = first; page <= last; page += 1) pages.push(page);
    pages.sort((a, b) => Math.abs(a + 0.5 - middle) - Math.abs(b + 0.5 - middle));
    return pages.find(page => {
        const size = loaded.get(page);
        return size === undefined || needsSharperThumbs(size, range.thumbSize);
    });
};

/**
 * The pages whose previews are kept: the ones the visible range touches and `keep` either side, as
 * `[first, last]`, clamped to the list. Previews of every other page are let go — their positions stay
 * laid out, and the page is asked for again when it comes back into view.
 */
export const keptPages = ({
    range,
    total,
    keep = KEEP_PAGES,
    pageSize = PAGE_SIZE,
}: {
    range: PhotoGridRange;
    total: number;
    keep?: number;
    pageSize?: number;
}): { first: number; last: number } => {
    const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
    const start = Math.max(0, Math.min(range.start, total));
    const end = Math.max(start + 1, Math.min(range.end, total));
    return {
        first: Math.max(0, Math.floor(start / pageSize) - keep),
        last: Math.min(lastPage, Math.floor((end - 1) / pageSize) + keep),
    };
};

/**
 * The page just past the visible range in the direction of the scroll, when it still needs loading —
 * asked for once everything on screen is in, so a steady scroll finds the next stretch already there.
 * `direction` is 1 for down, -1 for up.
 */
export const pageAhead = ({
    range,
    total,
    loaded,
    direction,
    pageSize = PAGE_SIZE,
}: {
    range: PhotoGridRange;
    total: number;
    loaded: ReadonlyMap<number, number>;
    direction: 1 | -1;
    pageSize?: number;
}): number | undefined => {
    const start = Math.max(0, Math.min(range.start, total));
    const end = Math.max(start, Math.min(range.end, total));
    if (end <= start) return undefined;
    const page = direction > 0 ? Math.floor((end - 1) / pageSize) + 1 : Math.floor(start / pageSize) - 1;
    if (page < 0 || page * pageSize >= total) return undefined;
    const size = loaded.get(page);
    return size === undefined || needsSharperThumbs(size, range.thumbSize) ? page : undefined;
};

/**
 * What to ask for next on a list laid out by offset: a page the visible range needs, or else the one
 * ahead of it. Page 0 whose first `firstPageSize` items came as the short first page is completed from
 * where that stopped rather than asked for whole again.
 */
export const offsetRequest = ({
    range,
    total,
    loaded,
    direction,
    firstPagePartial,
    pageSize = PAGE_SIZE,
    firstPageSize = FIRST_PAGE_SIZE,
}: {
    range: PhotoGridRange;
    total: number;
    loaded: ReadonlyMap<number, number>;
    direction: 1 | -1;
    firstPagePartial: boolean;
    pageSize?: number;
    firstPageSize?: number;
}): { offset: number; limit: number } | undefined => {
    const page =
        pageToLoad({ range, total, loaded, pageSize }) ?? pageAhead({ range, total, loaded, direction, pageSize });
    if (page === undefined) return undefined;
    if (page === 0 && firstPagePartial && !loaded.has(0)) {
        return { offset: firstPageSize, limit: pageSize - firstPageSize };
    }
    return { offset: page * pageSize, limit: pageSize };
};

/**
 * The in-app photo picker's state: what the attach menu previews, which album the grid shows and which
 * of it has loaded, and what is picked. The library itself is read through the shell (`photoLibrary`);
 * this hook only holds what the screen needs of it.
 *
 * The grid is virtual: it reports the range on screen, and pages are asked for to cover it, one request
 * at a time, nearest first. On an app that pages by offset the grid knows the album's length from the
 * first answer and any stretch of it can be filled directly — which is what lets a fast-scroll jump to
 * the far end of a long album without paging through it. An older app pages by cursor and the grid
 * grows as it scrolls, as it always did.
 *
 * On a list laid out by offset, previews of pages far from the visible range are let go as new pages
 * land (`keptPages`): a long scroll would otherwise keep every preview it passed. An older app's list
 * keeps them — its pages can only be asked for in order, and its previews are the small ones.
 *
 * `max` caps the pick — the per-message image limit, passed in so the grid and the send agree on it.
 * `columns` is the grid's column count, used to size the first page's previews before the grid has
 * measured itself.
 */
export const usePhotoPicker = ({
    max,
    allTitle,
    columns = 3,
    library = photoLibrary,
}: {
    max: number;
    /** The "all photos" title until the shell's album list names it. */
    allTitle: string;
    columns?: number;
    library?: PhotoLibrary;
}): PhotoPicker => {
    const [supported, setSupported] = useState<boolean | null>(library.isUnsupported() ? false : null);
    const [access, setAccess] = useState<PhotoLibraryAccess | null>(null);
    const [recent, setRecent] = useState<PhotoItem[]>([]);
    const [gridOpen, setGridOpen] = useState(false);
    const [albumsOpen, setAlbumsOpen] = useState(false);
    const [albums, setAlbums] = useState<PhotoAlbum[]>([]);
    const [album, setAlbum] = useState<{ id?: string; title: string }>({ title: allTitle });
    const [slots, setSlots] = useState<(Slot | undefined)[]>([]);
    // The same positions, for the page loop: eviction needs the ids of the pages it keeps the moment a
    // page lands, before the state carrying them has rendered.
    const slotsRef = useRef<(Slot | undefined)[]>([]);
    const [thumbs, setThumbs] = useState<ReadonlyMap<string, string>>(new Map());
    const [picked, setPicked] = useState<PhotoItem[]>([]);
    const [preparing, setPreparing] = useState(false);
    const [firstPageLoading, setFirstPageLoading] = useState(false);
    // Read by `toggle` and `closeGrid` in the same tick `takePicked` starts, before the state lands.
    const preparingRef = useRef(false);

    // What the page loop reads. Refs, because it runs from a request's completion as much as from a
    // render, and must see the newest values in both.
    const albumIdRef = useRef<string | undefined>(undefined);
    const layoutRef = useRef<Layout>('none');
    const slotCountRef = useRef(0);
    const nextRef = useRef<string | undefined>(undefined);
    /** Page index → the preview size it was asked at. Offset layout only. */
    const loadedRef = useRef(new Map<number, number>());
    const rangeRef = useRef<PhotoGridRange>({ start: 0, end: PAGE_SIZE });
    /** Which way the grid last scrolled, for the page asked for ahead of it. */
    const directionRef = useRef<1 | -1>(1);
    /** Page 0 holds only the short first page so far (offset layout). */
    const firstPagePartialRef = useRef(false);
    /** The preview size the short first page was asked at, so page 0 is recorded at the smaller one. */
    const firstPageSizeRef = useRef(0);
    /** The first page has had its one retry. */
    const firstPageRetriedRef = useRef(false);
    const columnsRef = useRef(columns);
    columnsRef.current = columns;
    const gridOpenRef = useRef(false);

    // One page in flight at a time. The shell lists one page at a time anyway, and a page asked for
    // while another is out is a page chosen against a range that may have moved on by the time it runs.
    const loadingRef = useRef(false);
    // Bumped on every album switch and every relist, so a page that lands for a list no longer shown is
    // dropped.
    const albumTokenRef = useRef(0);

    const probe = useCallback(async () => {
        if (library.isUnsupported()) {
            setSupported(false);
            return;
        }
        try {
            const page = await library.photos({ limit: RECENT_COUNT, thumbSize: previewSize(RECENT_TILE) });
            if (!page) {
                setSupported(false);
                return;
            }
            setSupported(true);
            setAccess(page.access);
            setRecent(toItems(page.items));
        } catch {
            // Transient: leave the verdict open, show no strip this time.
            setRecent([]);
        }
    }, [library]);

    /** The preview size for the grid before it has reported one: the window's width, split in columns. */
    const estimatedThumbSize = () =>
        typeof window === 'undefined'
            ? undefined
            : previewSize(gridMetrics({ width: window.innerWidth, columns: columnsRef.current, cells: 0 }).tile);

    const resetList = () => {
        setFirstPageLoading(false);
        layoutRef.current = 'none';
        slotCountRef.current = 0;
        nextRef.current = undefined;
        loadedRef.current = new Map();
        firstPagePartialRef.current = false;
        firstPageRetriedRef.current = false;
        directionRef.current = 1;
        loadingRef.current = false;
        slotsRef.current = [];
        setSlots([]);
        setThumbs(new Map());
        return ++albumTokenRef.current;
    };

    const addThumbs = (items: PhotoLibraryItem[]) => {
        if (items.length === 0) return;
        setThumbs(previous => {
            const merged = new Map(previous);
            for (const item of items) merged.set(item.id, thumbOf(item));
            return merged;
        });
    };

    /**
     * Lays a page answered by offset into the grid, starting over if the library's count moved.
     * `requested` is the offset asked for: a page past a shrunken list's end comes back clamped to it,
     * and marking that one loaded would mark a page that was never fetched at the new count.
     *
     * Answers whether the page loop moved forward — a page now counts as loaded, the short first page
     * landed, or the layout was remade. An answer that did none of these (an offset other than the one
     * asked for, at the same count) would otherwise be asked for again at once, and again.
     */
    const placeByOffset = (
        page: OnListPhotosPayload & { offset: number; total: number },
        requested: number,
        limit: number,
        size: number
    ): boolean => {
        const changed = layoutRef.current !== 'offset' || page.total !== slotCountRef.current;
        let progressed = changed;
        if (changed) {
            firstPagePartialRef.current = false;
            // A photo taken or deleted since the layout was made shifts every index after it, so the
            // pages already placed may now sit one off. The previews stay — they are by id — but every
            // page is asked for again as it comes into view.
            loadedRef.current = new Map();
        }
        layoutRef.current = 'offset';
        slotCountRef.current = page.total;
        if (page.offset === requested) {
            // A page is loaded once one answer — or the short first page and the rest of page 0 —
            // covers it to its end (or the list's).
            const index = Math.floor(requested / PAGE_SIZE);
            const pageEnd = Math.min((index + 1) * PAGE_SIZE, page.total);
            const fromStart = requested === index * PAGE_SIZE || (index === 0 && firstPagePartialRef.current);
            if (fromStart && requested + limit >= pageEnd) {
                // Completing page 0 from the short first page: its first previews came at that page's
                // size, so a pinch between the two halves still finds them soft and asks again.
                const completing = index === 0 && firstPagePartialRef.current && requested > 0;
                loadedRef.current.set(index, completing ? Math.min(firstPageSizeRef.current, size) : size);
                if (index === 0) firstPagePartialRef.current = false;
                progressed = true;
            } else if (requested === 0) {
                firstPagePartialRef.current = true;
                firstPageSizeRef.current = size;
                progressed = true;
            }
        }
        const next = changed ? new Array<Slot | undefined>(page.total) : slotsRef.current.slice();
        page.items.forEach((item, i) => {
            if (page.offset + i < next.length) next[page.offset + i] = toSlot(item);
        });
        slotsRef.current = next;
        setSlots(next);

        // Let go of the previews far from what is on screen, and forget those pages were loaded so they
        // are asked for again when they come back. Kept by id: whatever sits in the kept pages now —
        // which, after a count change, still holds the previews placed before it.
        const { first, last } = keptPages({ range: rangeRef.current, total: page.total });
        for (const loadedPage of [...loadedRef.current.keys()]) {
            if (loadedPage < first || loadedPage > last) loadedRef.current.delete(loadedPage);
        }
        // Page 0's short first page is let go with it; on the way back it is asked for whole.
        if (first > 0) firstPagePartialRef.current = false;
        const keep = new Set<string>();
        for (let i = first * PAGE_SIZE; i < Math.min(next.length, (last + 1) * PAGE_SIZE); i += 1) {
            const id = next[i]?.id;
            if (id) keep.add(id);
        }
        setThumbs(previous => {
            const kept = new Map<string, string>();
            for (const [id, src] of previous) if (keep.has(id)) kept.set(id, src);
            for (const item of page.items) if (keep.has(item.id)) kept.set(item.id, thumbOf(item));
            return kept;
        });
        return progressed;
    };

    const placeByCursor = (page: OnListPhotosPayload, append: boolean) => {
        layoutRef.current = 'cursor';
        nextRef.current = page.next;
        slotCountRef.current = (append ? slotCountRef.current : 0) + page.items.length;
        const added = page.items.map(toSlot);
        slotsRef.current = append ? [...slotsRef.current, ...added] : added;
        setSlots(slotsRef.current);
        addThumbs(page.items);
    };

    // The page loop. Each call asks for at most one page and calls itself again when that page lands,
    // so it runs until the range is covered and then stops until the range moves. A page that failed
    // (or a shell that turned out to have no picker) does not go round again at once: the same page
    // would be picked, and a failure that repeats would become a loop with nothing to slow it.
    const pumpRef = useRef<() => void>(() => undefined);
    pumpRef.current = () => {
        if (loadingRef.current || !gridOpenRef.current) return;
        const token = albumTokenRef.current;
        const albumId = albumIdRef.current;
        const thumbSize = rangeRef.current.thumbSize ?? estimatedThumbSize();

        let request: { offset?: number; after?: string; limit: number } | undefined;
        if (layoutRef.current === 'none') {
            // The first page is offset 0 when the app may page by offset: an app that does not still
            // answers the first page, and the missing echo says which kind it is. Short, for the first
            // screen's sake (`FIRST_PAGE_SIZE`).
            request = library.pagesByOffset() ? { offset: 0, limit: FIRST_PAGE_SIZE } : { limit: FIRST_PAGE_SIZE };
        } else if (layoutRef.current === 'offset') {
            request = offsetRequest({
                range: { ...rangeRef.current, thumbSize },
                total: slotCountRef.current,
                loaded: loadedRef.current,
                direction: directionRef.current,
                firstPagePartial: firstPagePartialRef.current,
            });
        } else if (nextRef.current && rangeRef.current.end >= slotCountRef.current - PAGE_SIZE) {
            // A page's worth ahead of the end, so a scroll does not reach it before the next page.
            request = { after: nextRef.current, limit: PAGE_SIZE };
        }
        if (!request) return;

        const first = layoutRef.current === 'none';
        if (first) setFirstPageLoading(true);
        loadingRef.current = true;
        let placed = false;
        void library
            .photos({ albumId, thumbSize, ...request })
            .then(page => {
                if (!page || token !== albumTokenRef.current) return;
                setAccess(page.access);
                if (page.offset !== undefined && page.total !== undefined) {
                    placed = placeByOffset(
                        { ...page, offset: page.offset, total: page.total },
                        request.offset ?? 0,
                        request.limit,
                        thumbSize ?? 0
                    );
                } else {
                    placeByCursor(page, request.after !== undefined);
                    placed = true;
                }
            })
            .catch(() => {
                // The next range change asks again.
            })
            .finally(() => {
                if (token !== albumTokenRef.current) return;
                loadingRef.current = false;
                if (placed) {
                    if (first) setFirstPageLoading(false);
                    pumpRef.current();
                } else if (first && !firstPageRetriedRef.current) {
                    // Once more after a pause, the skeleton still up; after that the grid shows what
                    // it has.
                    firstPageRetriedRef.current = true;
                    setTimeout(() => {
                        if (token === albumTokenRef.current) pumpRef.current();
                    }, FIRST_PAGE_RETRY_MS);
                } else if (first) {
                    setFirstPageLoading(false);
                }
            });
    };

    const openGrid = useCallback(
        (preselect?: PhotoItem) => {
            setGridOpen(true);
            gridOpenRef.current = true;
            setAlbumsOpen(false);
            setPicked(preselect ? [preselect] : []);
            resetList();
            pumpRef.current();
            void library
                .albums({ thumbSize: previewSize(COVER_TILE) })
                .then(result => {
                    if (!result) return;
                    setAccess(result.access);
                    setAlbums(
                        result.albums.map(a => ({
                            id: a.id,
                            title: a.title,
                            count: a.count,
                            coverSrc: a.coverBase64 ? photoPreviewSrc(a.coverBase64) : undefined,
                        }))
                    );
                })
                .catch(() => undefined);
        },
        // `resetList` touches refs and setters only.

        [library]
    );

    const closeGrid = useCallback(() => {
        // The grid stays while a send reads the pick; it closes itself when the read is done.
        if (preparingRef.current) return;
        gridOpenRef.current = false;
        setGridOpen(false);
    }, []);

    const selectAlbum = useCallback(
        (id: string) => {
            const chosen = albums.find(a => a.id === id);
            setAlbum({ id, title: chosen?.title ?? allTitle });
            albumIdRef.current = id;
            setAlbumsOpen(false);
            // A page for the old album may still be in flight; the token drops it when it lands, and
            // the lock is released so this album's first page is not refused.
            resetList();
            rangeRef.current = { start: 0, end: PAGE_SIZE, thumbSize: rangeRef.current.thumbSize };
            pumpRef.current();
        },

        [albums, allTitle]
    );

    const setVisibleRange = useCallback((range: PhotoGridRange) => {
        if (range.start !== rangeRef.current.start)
            {directionRef.current = range.start > rangeRef.current.start ? 1 : -1;}
        rangeRef.current = range;
        pumpRef.current();
    }, []);

    const photoAt = useCallback(
        (index: number): PhotoItem | undefined => {
            const slot = slots[index];
            if (!slot) return undefined;
            // Missing is not empty: an empty string is an item the app could make no preview of, drawn
            // plain; a missing one is still coming.
            const src = thumbs.get(slot.id);
            return src === undefined ? undefined : { ...slot, src };
        },
        [slots, thumbs]
    );

    // Picks survive an album switch on purpose: choosing across albums is the point of the list.
    // Picks are frozen while a send reads them: a pick changed meanwhile would be dropped when the read
    // ends and clears it, without a word.
    const toggle = useCallback(
        (photo: PhotoItem) => {
            if (preparingRef.current) return;
            setPicked(previous => {
                if (previous.some(p => p.id === photo.id)) return previous.filter(p => p.id !== photo.id);
                return previous.length >= max ? previous : [...previous, photo];
            });
        },
        [max]
    );

    const takePicked = useCallback(async (): Promise<PickedFromGrid> => {
        const chosen = picked;
        // The grid stays open while the pick is read: a video can take minutes to come down from
        // iCloud, and a sheet that closed at once would leave nothing on screen until the row appears.
        preparingRef.current = true;
        setPreparing(true);
        const items: ChatAttachmentSource[] = [];
        const refused: RefusedAttachment[] = [];
        try {
            // One at a time: each photo read holds a whole photo as base64 in page memory, and the shell
            // copies one video at a time.
            for (const item of chosen) {
                if (isVideo(item)) {
                    try {
                        items.push(await library.keepVideo(item));
                    } catch (error) {
                        refused.push({ name: '', kind: 'video', reason: refusalOf(error) });
                    }
                    continue;
                }
                try {
                    items.push(await library.read(item));
                } catch {
                    refused.push({ name: '', kind: 'image', reason: 'unreadable' });
                }
            }
        } finally {
            preparingRef.current = false;
            setPreparing(false);
            setPicked([]);
            gridOpenRef.current = false;
            setGridOpen(false);
        }
        // An app that turned out unable to keep a video: what it listed of them cannot be picked again.
        // The grid lists afresh when it next opens, and the list leaves videos out from now on.
        if (!library.videosSupported()) {
            setRecent(previous => previous.filter(item => !isVideo(item)));
            resetList();
        }
        return { items, refused };
    }, [library, picked]);

    const manageSelection = useCallback(async () => {
        // The list below runs either way: whatever the sheet changed is on the device by now, and the
        // page's own answer carries the access, so a sheet call that failed loses nothing worth keeping.
        try {
            const after = await library.manageSelection();
            if (after) setAccess(after);
        } catch {
            // Falls through to the list.
        }
        resetList();
        pumpRef.current();
    }, [library]);

    return {
        supported,
        access,
        recent,
        probe,
        gridOpen,
        openGrid,
        closeGrid,
        albumsOpen,
        toggleAlbums: () => setAlbumsOpen(value => !value),
        albums,
        album,
        selectAlbum,
        count: slots.length,
        loading: firstPageLoading,
        photoAt,
        setVisibleRange,
        picked,
        toggle,
        takePicked,
        preparing,
        manageSelection,
    };
};
