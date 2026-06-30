/**
 * `hooks/use-watchlist.ts`
 * - Observe 워치리스트 상태 + 검색 + 디바이스 reload. 디자인 seed/tick/search 포팅.
 * - Phase 2: INITIAL_OBSERVED/SEARCH_POOL/reload를 서버 `UserView.Devices` 구독으로 교체.
 */
import { useEffect, useMemo, useState } from 'react';

import {
    INITIAL_OBSERVED,
    makeUserFromSearch,
    reloadUserDevices,
    SEARCH_POOL,
    type ObservedUser,
    type SearchUser,
    type UserSearchType,
} from '../mock/observed-users';

export interface Watchlist {
    observed: ObservedUser[];
    selectedUserId: string | null;
    selected: ObservedUser | null;
    observedIds: Set<string>;
    selectUser(id: string): void;
    removeUser(id: string): void;
    reloadDevices(): void;
    // search
    searchOpen: boolean;
    openSearch(): void;
    closeSearch(): void;
    searchType: UserSearchType;
    setSearchType(t: UserSearchType): void;
    searchQuery: string;
    setSearchQuery(q: string): void;
    runSearch(): void;
    searchShown: SearchUser[];
    searchTotal: number;
    canLoadMore: boolean;
    loadMore(): void;
    addUser(u: SearchUser): void;
}

export const useWatchlist = (liveMotion: boolean): Watchlist => {
    const [observed, setObserved] = useState<ObservedUser[]>(INITIAL_OBSERVED);
    const [selectedUserId, setSelectedUserId] = useState<string | null>(INITIAL_OBSERVED[0]?.id ?? null);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchType, setSearchType] = useState<UserSearchType>('id');
    const [searchQuery, setSearchQuery] = useState('');
    const [appliedQuery, setAppliedQuery] = useState('');
    const [searchLoaded, setSearchLoaded] = useState(10);

    // 디바이스 활동 시뮬 — green 디바이스 tick/lastActive 갱신(1s).
    useEffect(() => {
        if (liveMotion === false) return;
        const timer = setInterval(() => {
            setObserved(prev =>
                prev.map(u => ({
                    ...u,
                    devices: u.devices.map(d => {
                        let { tick, lastActiveAt } = d;
                        lastActiveAt += 1;
                        if (d.status === 'green' && Math.random() < 0.5) {
                            tick += 1;
                            if (Math.random() < 0.6) lastActiveAt = 0;
                        }
                        return { ...d, tick, lastActiveAt };
                    }),
                }))
            );
        }, 1000);
        return () => clearInterval(timer);
    }, [liveMotion]);

    const observedIds = useMemo(() => new Set(observed.map(u => u.id)), [observed]);
    const selected = observed.find(u => u.id === selectedUserId) ?? null;

    const filteredPool = useMemo(() => {
        const q = appliedQuery.trim().toLowerCase();
        if (!q) return SEARCH_POOL;
        return SEARCH_POOL.filter(u => (searchType === 'name' ? u.display : u.id).toLowerCase().includes(q));
    }, [appliedQuery, searchType]);
    const searchShown = filteredPool.slice(0, searchLoaded);

    const applyQuery = () => {
        setAppliedQuery(searchQuery);
        setSearchLoaded(10);
    };

    return {
        observed,
        selectedUserId,
        selected,
        observedIds,
        selectUser: id => setSelectedUserId(id),
        removeUser: id =>
            setObserved(prev => {
                const next = prev.filter(u => u.id !== id);
                setSelectedUserId(sel => (sel === id ? (next[0]?.id ?? null) : sel));
                return next;
            }),
        reloadDevices: () =>
            setObserved(prev =>
                prev.map(u => (u.id === selectedUserId ? { ...u, devices: reloadUserDevices(u.devices) } : u))
            ),
        searchOpen,
        openSearch: () => {
            setSearchOpen(true);
            setSearchQuery('');
            setAppliedQuery('');
            setSearchLoaded(10);
        },
        closeSearch: () => setSearchOpen(false),
        searchType,
        setSearchType,
        searchQuery,
        setSearchQuery,
        runSearch: applyQuery,
        searchShown,
        searchTotal: filteredPool.length,
        canLoadMore: searchShown.length < filteredPool.length,
        loadMore: () => setSearchLoaded(n => n + 10),
        addUser: u => {
            if (observedIds.has(u.id)) return;
            const nu = makeUserFromSearch(u);
            setObserved(prev => [...prev, nu]);
            setSelectedUserId(nu.id);
        },
    };
};
