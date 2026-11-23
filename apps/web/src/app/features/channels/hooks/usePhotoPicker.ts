import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
    OnListPhotosPayload,
    PhotoLibraryAccess,
    PhotoLibraryItem,
    RefusedAttachment,
} from '@chatic/bridge-messages';
import type { ChatAttachmentSource } from '@chatic/runtime';
import {
    gridMetrics,
    isIdentityPhotoEdit,
    thumbPixelSize,
    type PhotoAlbum,
    type PhotoEdit,
    type PhotoGridRange,
    type PhotoItem,
    type PhotoItemKind,
} from '@chatic/web-ui-kit';

import { photoLibrary, photoPreviewSrc, type PhotoLibrary } from '../../../bridge/photoLibrary';
import { bakePhotoEdit, makeEditRendition, type EditRendition } from '../utils/bakePhotoEdit';

export const RECENT_COUNT = 30;
const RECENT_TILE = 90;
const COVER_TILE = 64;
export const PAGE_SIZE = 60;
export const FIRST_PAGE_SIZE = 24;
export const FIRST_PAGE_RETRY_MS = 1500;
export const KEEP_PAGES = 2;

export interface PhotoPicker {
    supported: boolean | null;
    access: PhotoLibraryAccess | null;
    recent: PhotoItem[];
    probe(): Promise<void>;

    gridOpen: boolean;
    openGrid(): void;
    closeGrid(): void;

    albumsOpen: boolean;
    toggleAlbums(): void;
    albums: PhotoAlbum[];
    album: { id?: string; title: string };
    selectAlbum(id: string): void;

    count: number;
    photoAt(index: number): PhotoItem | undefined;
    loading: boolean;
    setVisibleRange(range: PhotoGridRange): void;

    picked: PhotoItem[];
    toggle(photo: PhotoItem): void;
    clearPicked(): void;
    releaseBytes(): void;
    takePicked(): Promise<PickedFromGrid>;
    preparing: boolean;

    manageSelection(): Promise<void>;

    editAssets: ReadonlyMap<string, PhotoEditAsset>;
    loadForEdit(...ids: string[]): void;
    edits: ReadonlyMap<string, PhotoEdit>;
    setEdit(id: string, edit: PhotoEdit): void;
    restoreEdits(snapshot: ReadonlyMap<string, PhotoEdit>): void;
}

export interface PhotoEditAsset {
    status: 'loading' | 'ready' | 'failed';
    src?: string;
    width?: number;
    height?: number;
    editable: boolean;
}

export interface PickedFromGrid {
    items: ChatAttachmentSource[];
    refused: RefusedAttachment[];
    editFailed?: number;
}

interface Slot {
    id: string;
    kind?: PhotoItemKind;
    durationMs?: number;
}

type Layout = 'none' | 'offset' | 'cursor';

interface EditJob {
    id: string;
    token: number;
    read: Promise<unknown>;
}

const toSlot = (item: PhotoLibraryItem): Slot =>
    item.mediaType === 'video'
        ? { id: item.id, kind: 'video', ...(item.durationMs !== undefined ? { durationMs: item.durationMs } : {}) }
        : { id: item.id };

const toItems = (items: PhotoLibraryItem[]): PhotoItem[] =>
    items.map(item => ({ ...toSlot(item), src: photoPreviewSrc(item.thumbBase64) }));

const thumbOf = (item: PhotoLibraryItem): string => (item.thumbBase64 ? photoPreviewSrc(item.thumbBase64) : '');

const isVideo = (item: PhotoItem) => item.kind === 'video';

const isGif = (file: File) => file.type === 'image/gif';

const plainItem = ({ id, src, kind, durationMs }: PhotoItem): PhotoItem => ({
    id,
    src,
    ...(kind !== undefined ? { kind } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
});

const sameEdit = (a: PhotoEdit, b: PhotoEdit): boolean =>
    a === b ||
    (a.rotation === b.rotation &&
        a.flipH === b.flipH &&
        a.aspect === b.aspect &&
        a.crop.x === b.crop.x &&
        a.crop.y === b.crop.y &&
        a.crop.width === b.crop.width &&
        a.crop.height === b.crop.height);

export const editsDiffer = (a: ReadonlyMap<string, PhotoEdit>, b: ReadonlyMap<string, PhotoEdit>): boolean => {
    if (a.size !== b.size) return true;
    for (const [id, edit] of a) {
        const other = b.get(id);
        if (!other || !sameEdit(edit, other)) return true;
    }
    return false;
};

const refusalOf = (error: unknown): RefusedAttachment['reason'] => {
    const code = (error as { code?: string } | null)?.code;
    if (code === 'UNSUPPORTED') return 'unsupported';
    if (code === 'TOO_LARGE') return 'too-large';
    return 'unreadable';
};

const devicePixelRatio = (): number => (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);

const previewSize = (cssPixels: number): number => thumbPixelSize(cssPixels, devicePixelRatio());

export const needsSharperThumbs = (have: number, want: number | undefined): boolean =>
    want !== undefined && have * 1.2 < want;

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

export const usePhotoPicker = ({
    max,
    allTitle,
    columns = 3,
    library = photoLibrary,
    bake = bakePhotoEdit,
    rendition = makeEditRendition,
}: {
    max: number;
    allTitle: string;
    columns?: number;
    library?: PhotoLibrary;
    bake?: (file: File, edit: PhotoEdit) => Promise<File | null>;
    rendition?: (file: File) => Promise<EditRendition | null>;
}): PhotoPicker => {
    const [supported, setSupported] = useState<boolean | null>(library.isUnsupported() ? false : null);
    const [access, setAccess] = useState<PhotoLibraryAccess | null>(null);
    const [recent, setRecent] = useState<PhotoItem[]>([]);
    const [gridOpen, setGridOpen] = useState(false);
    const [albumsOpen, setAlbumsOpen] = useState(false);
    const [albums, setAlbums] = useState<PhotoAlbum[]>([]);
    const [album, setAlbum] = useState<{ id?: string; title: string }>({ title: allTitle });
    const [slots, setSlots] = useState<(Slot | undefined)[]>([]);
    const slotsRef = useRef<(Slot | undefined)[]>([]);
    const [thumbs, setThumbs] = useState<ReadonlyMap<string, string>>(new Map());
    const [picked, setPickedState] = useState<PhotoItem[]>([]);
    const pickedRef = useRef<PhotoItem[]>([]);
    const [preparing, setPreparing] = useState(false);
    const [firstPageLoading, setFirstPageLoading] = useState(false);
    const preparingRef = useRef(false);

    const albumIdRef = useRef<string | undefined>(undefined);
    const layoutRef = useRef<Layout>('none');
    const slotCountRef = useRef(0);
    const nextRef = useRef<string | undefined>(undefined);
    const loadedRef = useRef(new Map<number, number>());
    const rangeRef = useRef<PhotoGridRange>({ start: 0, end: PAGE_SIZE });
    const directionRef = useRef<1 | -1>(1);
    const firstPagePartialRef = useRef(false);
    const firstPageSizeRef = useRef(0);
    const firstPageRetriedRef = useRef(false);
    const columnsRef = useRef(columns);
    columnsRef.current = columns;
    const gridOpenRef = useRef(false);

    const loadingRef = useRef(false);
    const albumTokenRef = useRef(0);

    const filesRef = useRef(new Map<string, File>());
    const [editAssets, setEditAssetsState] = useState<ReadonlyMap<string, PhotoEditAsset>>(new Map());
    const assetsRef = useRef(new Map<string, PhotoEditAsset>());
    const [edits, setEditsState] = useState<ReadonlyMap<string, PhotoEdit>>(new Map());
    const editsRef = useRef<ReadonlyMap<string, PhotoEdit>>(new Map());
    const waitingRef = useRef<string[]>([]);
    const jobRef = useRef<EditJob | null>(null);
    const pickTokenRef = useRef(0);

    const setPicked = (next: PhotoItem[]) => {
        pickedRef.current = next;
        setPickedState(next);
    };

    const setAsset = (id: string, asset: PhotoEditAsset | undefined) => {
        const next = new Map(assetsRef.current);
        if (asset) next.set(id, asset);
        else next.delete(id);
        assetsRef.current = next;
        setEditAssetsState(next);
    };

    const commitEdits = (next: ReadonlyMap<string, PhotoEdit>) => {
        editsRef.current = next;
        setEditsState(next);
    };

    const releasePhoto = (id: string) => {
        filesRef.current.delete(id);
        waitingRef.current = waitingRef.current.filter(waiting => waiting !== id);
        const asset = assetsRef.current.get(id);
        if (asset?.src) URL.revokeObjectURL(asset.src);
        if (asset) setAsset(id, undefined);
        if (editsRef.current.has(id)) {
            const next = new Map(editsRef.current);
            next.delete(id);
            commitEdits(next);
        }
    };

    const releasePick = () => {
        pickTokenRef.current += 1;
        filesRef.current = new Map();
        waitingRef.current = [];
        for (const asset of assetsRef.current.values()) if (asset.src) URL.revokeObjectURL(asset.src);
        if (assetsRef.current.size > 0) {
            assetsRef.current = new Map();
            setEditAssetsState(assetsRef.current);
        }
        if (editsRef.current.size > 0) commitEdits(new Map());
    };

    useEffect(
        () => () => {
            pickTokenRef.current += 1;
            for (const asset of assetsRef.current.values()) if (asset.src) URL.revokeObjectURL(asset.src);
        },
        []
    );

    const pumpEditRef = useRef<() => void>(() => undefined);
    pumpEditRef.current = () => {
        if (jobRef.current || preparingRef.current) return;
        const id = waitingRef.current.shift();
        if (id === undefined) return;
        const token = pickTokenRef.current;
        const wanted = () => token === pickTokenRef.current && pickedRef.current.some(item => item.id === id);
        setAsset(id, { status: 'loading', editable: true });

        const read = (async (): Promise<File | undefined> => {
            let file: File;
            try {
                file = filesRef.current.get(id) ?? (await library.read({ id }));
            } catch {
                if (wanted()) setAsset(id, { status: 'failed', editable: true });
                return undefined;
            }
            if (!wanted()) return undefined;
            filesRef.current.set(id, file);
            return file;
        })();
        const copy = async () => {
            const file = await read;
            if (!file || preparingRef.current) return;
            let made: EditRendition | null = null;
            try {
                made = await rendition(file);
            } catch {
                made = null;
            }
            if (!wanted() || preparingRef.current) {
                if (made) URL.revokeObjectURL(made.src);
                return;
            }
            const editable = !isGif(file);
            setAsset(id, made ? { status: 'ready', editable, ...made } : { status: 'failed', editable });
        };
        jobRef.current = { id, token, read };
        void copy().finally(() => {
            jobRef.current = null;
            pumpEditRef.current();
        });
    };

    const loadForEdit = useCallback((...ids: string[]) => {
        if (preparingRef.current) return;
        const photos = new Set(pickedRef.current.filter(item => !isVideo(item)).map(item => item.id));
        const job = jobRef.current;
        const underWay = job && job.token === pickTokenRef.current ? job.id : undefined;
        waitingRef.current = [...new Set(ids)].filter(
            id => photos.has(id) && !assetsRef.current.has(id) && id !== underWay
        );
        pumpEditRef.current();
    }, []);

    const setEdit = useCallback((id: string, edit: PhotoEdit) => {
        if (preparingRef.current || !pickedRef.current.some(item => item.id === id)) return;
        const next = new Map(editsRef.current);
        if (isIdentityPhotoEdit(edit)) next.delete(id);
        else next.set(id, edit);
        commitEdits(next);
    }, []);

    const restoreEdits = useCallback((snapshot: ReadonlyMap<string, PhotoEdit>) => {
        if (preparingRef.current) return;
        const ids = new Set(pickedRef.current.map(item => item.id));
        commitEdits(new Map([...snapshot].filter(([id]) => ids.has(id))));
    }, []);

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
            setRecent([]);
        }
    }, [library]);

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
            loadedRef.current = new Map();
        }
        layoutRef.current = 'offset';
        slotCountRef.current = page.total;
        if (page.offset === requested) {
            const index = Math.floor(requested / PAGE_SIZE);
            const pageEnd = Math.min((index + 1) * PAGE_SIZE, page.total);
            const fromStart = requested === index * PAGE_SIZE || (index === 0 && firstPagePartialRef.current);
            if (fromStart && requested + limit >= pageEnd) {
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

        const { first, last } = keptPages({ range: rangeRef.current, total: page.total });
        for (const loadedPage of [...loadedRef.current.keys()]) {
            if (loadedPage < first || loadedPage > last) loadedRef.current.delete(loadedPage);
        }
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

    const pumpRef = useRef<() => void>(() => undefined);
    pumpRef.current = () => {
        if (loadingRef.current || !gridOpenRef.current) return;
        const token = albumTokenRef.current;
        const albumId = albumIdRef.current;
        const thumbSize = rangeRef.current.thumbSize ?? estimatedThumbSize();

        let request: { offset?: number; after?: string; limit: number } | undefined;
        if (layoutRef.current === 'none') {
            request = { offset: 0, limit: FIRST_PAGE_SIZE };
        } else if (layoutRef.current === 'offset') {
            request = offsetRequest({
                range: { ...rangeRef.current, thumbSize },
                total: slotCountRef.current,
                loaded: loadedRef.current,
                direction: directionRef.current,
                firstPagePartial: firstPagePartialRef.current,
            });
        } else if (nextRef.current && rangeRef.current.end >= slotCountRef.current - PAGE_SIZE) {
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
                    firstPageRetriedRef.current = true;
                    setTimeout(() => {
                        if (token === albumTokenRef.current) pumpRef.current();
                    }, FIRST_PAGE_RETRY_MS);
                } else if (first) {
                    setFirstPageLoading(false);
                }
            });
    };

    const openGrid = useCallback(() => {
        setGridOpen(true);
        gridOpenRef.current = true;
        setAlbumsOpen(false);
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
    }, [library]);

    const releaseBytes = useCallback(() => {
        if (preparingRef.current) return;
        filesRef.current = new Map();
        waitingRef.current = [];
    }, []);

    const closeGrid = useCallback(() => {
        if (preparingRef.current) return;
        gridOpenRef.current = false;
        setGridOpen(false);
        releaseBytes();
    }, [releaseBytes]);

    const clearPicked = useCallback(() => {
        if (preparingRef.current) return;
        setPicked([]);
        releasePick();
    }, []);

    const selectAlbum = useCallback(
        (id: string) => {
            const chosen = albums.find(a => a.id === id);
            setAlbum({ id, title: chosen?.title ?? allTitle });
            albumIdRef.current = id;
            setAlbumsOpen(false);
            resetList();
            rangeRef.current = { start: 0, end: PAGE_SIZE, thumbSize: rangeRef.current.thumbSize };
            pumpRef.current();
        },

        [albums, allTitle]
    );

    const setVisibleRange = useCallback((range: PhotoGridRange) => {
        if (range.start !== rangeRef.current.start) {
            directionRef.current = range.start > rangeRef.current.start ? 1 : -1;
        }
        rangeRef.current = range;
        pumpRef.current();
    }, []);

    const photoAt = useCallback(
        (index: number): PhotoItem | undefined => {
            const slot = slots[index];
            if (!slot) return undefined;
            const src = thumbs.get(slot.id);
            return src === undefined ? undefined : { ...slot, src };
        },
        [slots, thumbs]
    );

    const toggle = useCallback(
        (photo: PhotoItem) => {
            if (preparingRef.current) return;
            const previous = pickedRef.current;
            if (previous.some(p => p.id === photo.id)) {
                setPicked(previous.filter(p => p.id !== photo.id));
                releasePhoto(photo.id);
                return;
            }
            if (previous.length < max) setPicked([...previous, plainItem(photo)]);
        },
        [max]
    );

    const takePicked = useCallback(async (): Promise<PickedFromGrid> => {
        const chosen = pickedRef.current;
        const chosenEdits = editsRef.current;
        preparingRef.current = true;
        setPreparing(true);
        waitingRef.current = [];
        const items: ChatAttachmentSource[] = [];
        const refused: RefusedAttachment[] = [];
        let editFailed = 0;
        try {
            const job = jobRef.current;
            if (job && job.token === pickTokenRef.current && chosen.some(item => item.id === job.id)) {
                await job.read;
            }
            for (const item of chosen) {
                if (isVideo(item)) {
                    try {
                        items.push(await library.keepVideo(item));
                    } catch (error) {
                        refused.push({ name: '', kind: 'video', reason: refusalOf(error) });
                    }
                    continue;
                }
                let file: File;
                try {
                    file = filesRef.current.get(item.id) ?? (await library.read(item));
                } catch {
                    refused.push({ name: '', kind: 'image', reason: 'unreadable' });
                    continue;
                }
                const edit = chosenEdits.get(item.id);
                if (!edit || isIdentityPhotoEdit(edit) || isGif(file)) {
                    items.push(file);
                    continue;
                }
                const baked = await bake(file, edit).catch(() => null);
                if (baked) items.push(baked);
                else editFailed += 1;
            }
        } finally {
            preparingRef.current = false;
            setPreparing(false);
            setPicked([]);
            releasePick();
            gridOpenRef.current = false;
            setGridOpen(false);
        }
        return editFailed > 0 ? { items, refused, editFailed } : { items, refused };
    }, [library, bake]);

    const pickedView = useMemo(
        () =>
            picked.map(item => {
                const edit = edits.get(item.id);
                const asset = editAssets.get(item.id);
                if (!edit || isIdentityPhotoEdit(edit) || asset?.status !== 'ready') return item;
                if (!asset.src || !asset.width || !asset.height) return item;
                return { ...item, edited: { src: asset.src, width: asset.width, height: asset.height, edit } };
            }),
        [picked, edits, editAssets]
    );

    const manageSelection = useCallback(async () => {
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
        picked: pickedView,
        toggle,
        clearPicked,
        releaseBytes,
        takePicked,
        preparing,
        manageSelection,
        editAssets,
        loadForEdit,
        edits,
        setEdit,
        restoreEdits,
    };
};
