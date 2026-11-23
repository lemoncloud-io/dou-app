import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { runtime, type RoomMediaCounts } from '@chatic/runtime';

import { useHiddenMedia } from '../lib/localMediaPrefs';
import {
    mergeNewestFirst,
    TAB_KINDS,
    toRoomFileEntry,
    type ChatMediaKind,
    type RoomFileEntry,
    type RoomFilesTab,
} from '../utils/roomFiles';
import { isRuntimeNotAvailable } from '../utils/runtimeNotAvailable';

const PAGE_SIZE = 60;
const HISTORY_PAGE_SIZE = 50;

interface KindPage {
    items: RoomFileEntry[];
    next: number | null | undefined;
}

export const withNewestPage = (had: KindPage | undefined, page: KindPage): KindPage => {
    const floor = page.items.length ? page.items[page.items.length - 1]!.chatNo : Number.POSITIVE_INFINITY;
    const below = had?.items.filter(entry => entry.chatNo < floor) ?? [];
    if (below.length === 0) return page;
    return { items: [...page.items, ...below], next: had?.next ?? page.next };
};

export const withOlderPage = (had: KindPage | undefined, page: KindPage): KindPage => {
    const items = had?.items ?? [];
    const seen = new Set(items.map(entry => entry.key));
    return { items: [...items, ...page.items.filter(entry => !seen.has(entry.key))], next: page.next };
};

const useRoomChats = () => runtime.data.useRuntimeRepositories().chat;

export const useRoomMediaCounts = (cid: string | undefined, channelId: string | undefined) => {
    const chats = useRoomChats();
    const [counts, setCounts] = useState<RoomMediaCounts | null>(null);
    const [unavailable, setUnavailable] = useState(false);

    const reload = useCallback(async () => {
        if (!cid || !channelId) return;
        try {
            setCounts(await chats.countRoomMedia({ channelId }));
        } catch (error) {
            if (isRuntimeNotAvailable(error)) setUnavailable(true);
        }
    }, [chats, cid, channelId]);

    useEffect(() => {
        void reload();
    }, [reload]);

    useEffect(() => {
        if (!cid || !channelId) return undefined;
        let first = true;
        return chats.observeList({ channelId, limit: 1 }, () => {
            if (first) {
                first = false;
                return;
            }
            void reload();
        });
    }, [chats, cid, channelId, reload]);

    return { counts, unavailable, reload };
};

export const useRoomFiles = ({
    cid,
    uid,
    channelId,
    tab,
}: {
    cid: string | undefined;
    uid: string | undefined;
    channelId: string | undefined;
    tab: RoomFilesTab;
}) => {
    const kinds = TAB_KINDS[tab];
    const chats = useRoomChats();
    const [pages, setPages] = useState<Partial<Record<ChatMediaKind, KindPage>>>({});
    const pagesRef = useRef(pages);
    pagesRef.current = pages;
    const [loading, setLoading] = useState(false);
    const [unavailable, setUnavailable] = useState(false);
    const [searching, setSearching] = useState(false);
    const [historyCursor, setHistoryCursor] = useState<number | undefined>(undefined);
    const autoSearched = useRef(new Set<RoomFilesTab>());
    const generation = useRef(0);
    const hidden = useHiddenMedia(cid && uid ? { cid, uid } : undefined);

    const readPage = useCallback(
        async (kind: ChatMediaKind, cursorNo: number | undefined): Promise<KindPage | undefined> => {
            if (!cid || !channelId) return undefined;
            const page = await chats.listRoomMedia({
                channelId,
                kind,
                ...(cursorNo !== undefined ? { cursorNo } : {}),
                limit: PAGE_SIZE,
            });
            const items = page.items
                .map(item => toRoomFileEntry(item, cid))
                .filter((entry): entry is RoomFileEntry => !!entry);
            return { items, next: page.nextCursorNo };
        },
        [chats, cid, channelId]
    );

    const reload = useCallback(async () => {
        const run = ++generation.current;
        setLoading(true);
        try {
            const fresh = await Promise.all(kinds.map(kind => readPage(kind, undefined)));
            if (run !== generation.current) return;
            setPages(previous => {
                const next = { ...previous };
                kinds.forEach((kind, at) => {
                    const page = fresh[at];
                    if (page) next[kind] = withNewestPage(previous[kind], page);
                });
                return next;
            });
        } catch (error) {
            if (isRuntimeNotAvailable(error)) setUnavailable(true);
        } finally {
            if (run === generation.current) setLoading(false);
        }
    }, [kinds, readPage]);

    const loadMore = useCallback(async () => {
        const now = pagesRef.current;
        const due = kinds.filter(kind => {
            const page = now[kind];
            return page && page.next !== null && page.next !== undefined;
        });
        if (due.length === 0 || loading) return;
        setLoading(true);
        try {
            const more = await Promise.all(due.map(kind => readPage(kind, now[kind]?.next ?? undefined)));
            setPages(previous => {
                const next = { ...previous };
                due.forEach((kind, at) => {
                    const page = more[at];
                    if (page) next[kind] = withOlderPage(previous[kind], page);
                });
                return next;
            });
        } finally {
            setLoading(false);
        }
    }, [kinds, loading, readPage]);

    const exhausted = kinds.every(kind => pages[kind]?.next === null);
    const serverDone = historyCursor === 0;

    const findOlder = useCallback(async () => {
        if (!cid || !channelId || searching || serverDone) return;
        setSearching(true);
        try {
            const lowest = Math.min(
                ...kinds.flatMap(kind => pagesRef.current[kind]?.items.map(entry => entry.chatNo) ?? []),
                Number.POSITIVE_INFINITY
            );
            const cursorNo = historyCursor ?? (Number.isFinite(lowest) ? lowest : undefined);
            const result = await chats.refreshList({
                channelId,
                ...(cursorNo !== undefined ? { cursorNo } : {}),
                limit: HISTORY_PAGE_SIZE,
            } as Parameters<typeof chats.refreshList>[0]);
            setHistoryCursor(result.cursorNo ?? 0);
            const more = await Promise.all(
                kinds.map(kind => {
                    const had = pagesRef.current[kind]?.items;
                    return readPage(kind, had?.length ? had[had.length - 1]!.chatNo : undefined);
                })
            );
            setPages(previous => {
                const next = { ...previous };
                kinds.forEach((kind, at) => {
                    const page = more[at];
                    if (page) next[kind] = withOlderPage(previous[kind], page);
                });
                return next;
            });
        } catch (error) {
            if (isRuntimeNotAvailable(error)) setUnavailable(true);
        } finally {
            setSearching(false);
        }
    }, [chats, cid, channelId, historyCursor, kinds, readPage, searching, serverDone]);

    useEffect(() => {
        if (!cid || !channelId) return undefined;
        return chats.observeList({ channelId, limit: 1 }, () => void reload());
    }, [chats, cid, channelId, reload]);

    const entries = useMemo(() => {
        const merged = mergeNewestFirst(kinds.map(kind => pages[kind] ?? { items: [], next: undefined }));
        return hidden.size ? merged.filter(entry => !hidden.has(entry.key)) : merged;
    }, [hidden, kinds, pages]);

    useEffect(() => {
        if (!exhausted || entries.length > 0 || serverDone || searching || autoSearched.current.has(tab)) return;
        autoSearched.current.add(tab);
        void findOlder();
    }, [entries.length, exhausted, findOlder, searching, serverDone, tab]);

    return {
        entries,
        loading: loading && entries.length === 0,
        hasMorePages: !exhausted,
        loadMore,
        canFindOlder: exhausted && !serverDone,
        findOlder,
        searching,
        unavailable,
    };
};
