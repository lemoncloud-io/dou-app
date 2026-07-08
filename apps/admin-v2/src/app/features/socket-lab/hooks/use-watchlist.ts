/**
 * `hooks/use-watchlist.ts`
 */
import { useCallback, useMemo, useRef, useState } from 'react';

import { fetchObservedUsers, fetchUserPresence, updateUserDevices } from '../api/userApi';
import type { ObservedUser, UserSearchType } from '../mock/observed-users';

const PAGE_SIZE = 10;

export interface Watchlist {
    observed: ObservedUser[];
    selectedUserId: string | null;
    selected: ObservedUser | null;
    observedIds: Set<string>;
    selectUser(id: string): void;
    removeUser(id: string): void;
    reorderUser(fromId: string, toId: string): void;
    reloadDevices(): void;
    deleteDevice(deviceId: string): Promise<void>;
    reloading: boolean;
    // search
    searchOpen: boolean;
    openSearch(): void;
    closeSearch(): void;
    searchType: UserSearchType;
    setSearchType(t: UserSearchType): void;
    searchQuery: string;
    setSearchQuery(q: string): void;
    runSearch(): void;
    searchShown: ObservedUser[];
    searchTotal: number;
    searchLoading: boolean;
    searchError: string | null;
    canLoadMore: boolean;
    loadMore(): void;
    addUser(u: ObservedUser): void;
}

export const useWatchlist = (): Watchlist => {
    const [observed, setObserved] = useState<ObservedUser[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [reloading, setReloading] = useState(false);

    const [searchOpen, setSearchOpen] = useState(false);
    const [searchType, setSearchType] = useState<UserSearchType>('id');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchList, setSearchList] = useState<ObservedUser[]>([]);
    const [searchTotal, setSearchTotal] = useState(0);
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);

    const applied = useRef<{ type: UserSearchType; query: string; page: number }>({ type: 'id', query: '', page: 0 });

    const loadPage = useCallback(async (append: boolean) => {
        setSearchLoading(true);
        setSearchError(null);
        try {
            const { type, query, page } = applied.current;
            const res = await fetchObservedUsers({ type, query, page, limit: PAGE_SIZE });
            setSearchList(prev => (append ? [...prev, ...res.list] : res.list));
            setSearchTotal(res.total);
        } catch (e) {
            setSearchError(e instanceof Error ? e.message : `${e}`);
            if (!append) setSearchList([]);
        } finally {
            setSearchLoading(false);
        }
    }, []);

    // 선택/추가/reload 공용 — id로 presence(디바이스) 최신화 후 해당 유저만 갱신.
    const refreshPresence = useCallback(
        (id: string) =>
            fetchUserPresence(id)
                .then(p =>
                    setObserved(prev =>
                        prev.map(u => (u.id === id ? { ...u, presence: p.presence, devices: p.devices } : u))
                    )
                )
                .catch(() => undefined),
        []
    );

    const observedIds = useMemo(() => new Set(observed.map(u => u.id)), [observed]);
    const selected = observed.find(u => u.id === selectedUserId) ?? null;

    return {
        observed,
        selectedUserId,
        selected,
        observedIds,
        selectUser: id => {
            setSelectedUserId(id);
            void refreshPresence(id); // 전환 시에도 presence 호출
        },
        removeUser: id =>
            setObserved(prev => {
                const next = prev.filter(u => u.id !== id);
                setSelectedUserId(sel => (sel === id ? (next[0]?.id ?? null) : sel));
                return next;
            }),
        reorderUser: (fromId, toId) =>
            setObserved(prev => {
                if (fromId === toId) return prev;
                const from = prev.findIndex(u => u.id === fromId);
                const to = prev.findIndex(u => u.id === toId);
                if (from < 0 || to < 0) return prev;
                const next = [...prev];
                const [moved] = next.splice(from, 1);
                next.splice(to, 0, moved);
                return next;
            }),
        reloadDevices: () => {
            const id = selectedUserId;
            if (!id) return;
            setReloading(true);
            void refreshPresence(id).finally(() => setReloading(false));
        },
        reloading,
        deleteDevice: async deviceId => {
            const user = observed.find(u => u.id === selectedUserId);
            if (!user) return;
            const deviceIds = user.devices.filter(d => d.id !== deviceId).map(d => d.id);
            await updateUserDevices(user.id, deviceIds);
            await refreshPresence(user.id);
        },
        searchOpen,
        openSearch: () => {
            setSearchOpen(true);
            setSearchQuery('');
            applied.current = { type: searchType, query: '', page: 0 };
            void loadPage(false);
        },
        closeSearch: () => setSearchOpen(false),
        searchType,
        setSearchType,
        searchQuery,
        setSearchQuery,
        runSearch: () => {
            applied.current = { type: searchType, query: searchQuery, page: 0 };
            void loadPage(false);
        },
        searchShown: searchList,
        searchTotal,
        searchLoading,
        searchError,
        canLoadMore: searchList.length < searchTotal,
        loadMore: () => {
            applied.current = { ...applied.current, page: applied.current.page + 1 };
            void loadPage(true);
        },
        addUser: u => {
            if (observedIds.has(u.id)) return;
            setObserved(prev => [...prev, u]);
            setSelectedUserId(u.id);
            void refreshPresence(u.id);
        },
    };
};
