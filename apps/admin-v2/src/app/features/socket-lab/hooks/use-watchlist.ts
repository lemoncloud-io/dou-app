/**
 * `hooks/use-watchlist.ts`
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ClientSocketState, DeviceView } from '@lemoncloud/chatic-sockets-lib';

import { fetchObservedUsers, fetchUserPresence, mapDeviceView, updateUserDevices } from '../api/userApi';
import type { UsersStage } from '../api/userApi';
import { createObserveSyncContainer, type ObserveSyncContainer } from '../runtime/observe-sync-container';
import type { ObservedDevice, ObservedUser, Presence, UserSearchType } from '../mock/observed-users';

const PAGE_SIZE = 10;
const MAX_OBSERVED_DEVICES = 30;
const DISCOVERY_INTERVAL_MS = 60_000;

export const worstPresence = (devices: ObservedDevice[], fallback: Presence): Presence =>
    !devices.length
        ? fallback
        : devices.some(d => d.status === 'red')
          ? 'red'
          : devices.some(d => d.status === 'yellow')
            ? 'yellow'
            : 'green';

const sameDevice = (a: ObservedDevice, b: ObservedDevice): boolean =>
    a.id === b.id &&
    a.name === b.name &&
    a.platform === b.platform &&
    a.status === b.status &&
    a.tick === b.tick &&
    a.viewing === b.viewing &&
    a.lastActiveAt === b.lastActiveAt;

export const patchDevice = (list: ObservedUser[], deviceId: string, view: DeviceView): ObservedUser[] => {
    let changed = false;
    const next = list.map(u => {
        const prev = u.devices.find(d => d.id === deviceId);
        if (!prev) return u;
        const mapped = { ...mapDeviceView(view), name: view?.name ? `${view.name}` : prev.name };
        if (sameDevice(prev, mapped)) return u;
        changed = true;
        const devices = u.devices.map(d => (d.id === deviceId ? mapped : d));
        return { ...u, devices, presence: worstPresence(devices, u.presence) };
    });
    return changed ? next : list;
};

export interface Watchlist {
    stage: UsersStage;
    setStage(s: UsersStage): void;
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
    syncState: ClientSocketState;
    lastSyncAt: number | null;
    addError: string | null;
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
    const [stage, setStage] = useState<UsersStage>('d1');
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
    const stageCache = useRef<Partial<Record<UsersStage, { observed: ObservedUser[]; selectedUserId: string | null }>>>(
        {}
    );

    const [addError, setAddError] = useState<string | null>(null);
    const [syncStates, setSyncStates] = useState<Record<UsersStage, ClientSocketState>>({ d1: 'idle', v1: 'idle' });
    const [lastSyncAts, setLastSyncAts] = useState<Record<UsersStage, number | null>>({ d1: null, v1: null });
    const containers = useRef<Partial<Record<UsersStage, ObserveSyncContainer>>>({});
    // 구독 콜백에서 최신 값 참조용
    const stageRef = useRef(stage);
    stageRef.current = stage;
    const observedRef = useRef(observed);
    observedRef.current = observed;

    useEffect(() => {
        const created = (['d1', 'v1'] as UsersStage[]).map(s => {
            const container = createObserveSyncContainer(s);
            containers.current[s] = container;
            const unsub = container.subscribe(event => {
                if (event.type === 'state') {
                    setSyncStates(prev => ({ ...prev, [s]: event.state }));
                } else if (event.type === 'sync') {
                    setLastSyncAts(prev => ({ ...prev, [s]: event.at }));
                } else if (s === stageRef.current) {
                    setObserved(prev => patchDevice(prev, event.deviceId, event.view));
                } else {
                    const cached = stageCache.current[s];
                    if (cached) cached.observed = patchDevice(cached.observed, event.deviceId, event.view);
                }
            });
            return { container, unsub };
        });
        const timer = window.setTimeout(() => created.forEach(({ container }) => void container.connect()), 0);
        return () => {
            window.clearTimeout(timer);
            created.forEach(({ container, unsub }) => {
                unsub();
                void container.dispose();
            });
            containers.current = {};
        };
    }, []);

    useEffect(() => {
        containers.current[stage]?.setTargets(observed.flatMap(u => u.devices.map(d => d.id)));
    }, [observed, stage]);

    const loadPage = useCallback(
        async (append: boolean) => {
            setSearchLoading(true);
            setSearchError(null);
            try {
                const { type, query, page } = applied.current;
                const res = await fetchObservedUsers({ type, query, page, limit: PAGE_SIZE, stage });
                setSearchList(prev => (append ? [...prev, ...res.list] : res.list));
                setSearchTotal(res.total);
            } catch (e) {
                setSearchError(e instanceof Error ? e.message : `${e}`);
                if (!append) setSearchList([]);
            } finally {
                setSearchLoading(false);
            }
        },
        [stage]
    );

    const refreshPresence = useCallback(
        (id: string, s?: UsersStage) => {
            const target = s ?? stage;
            return fetchUserPresence(id, target)
                .then(p => {
                    if (stageRef.current !== target) return;
                    setObserved(prev =>
                        prev.map(u => (u.id === id ? { ...u, presence: p.presence, devices: p.devices } : u))
                    );
                })
                .catch(() => undefined);
        },
        [stage]
    );

    useEffect(() => {
        const timer = window.setInterval(() => {
            if (document.hidden) return;
            observedRef.current.forEach(u => void refreshPresence(u.id));
        }, DISCOVERY_INTERVAL_MS);
        return () => window.clearInterval(timer);
    }, [refreshPresence]);

    const observedIds = useMemo(() => new Set(observed.map(u => u.id)), [observed]);
    const selected = observed.find(u => u.id === selectedUserId) ?? null;

    return {
        stage,
        setStage: s => {
            if (s === stage) return;
            stageCache.current[stage] = { observed, selectedUserId };
            const cached = stageCache.current[s];
            setStage(s);
            setObserved(cached?.observed ?? []);
            setSelectedUserId(cached?.selectedUserId ?? null);
            setSearchList([]);
            setSearchTotal(0);
            (cached?.observed ?? []).forEach(u => void refreshPresence(u.id, s));
        },
        observed,
        selectedUserId,
        selected,
        observedIds,
        selectUser: id => {
            setSelectedUserId(id);
            void refreshPresence(id);
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
            await updateUserDevices(user.id, deviceIds, stage);
            setObserved(prev =>
                prev.map(u => (u.id === user.id ? { ...u, devices: u.devices.filter(d => d.id !== deviceId) } : u))
            );
            const p = await fetchUserPresence(user.id, stage).catch(() => null);
            if (!p || stageRef.current !== stage) return;
            const devices = p.devices.filter(d => d.id !== deviceId);
            setObserved(prev => prev.map(u => (u.id === user.id ? { ...u, presence: p.presence, devices } : u)));
        },
        syncState: syncStates[stage],
        lastSyncAt: lastSyncAts[stage],
        addError,
        searchOpen,
        openSearch: () => {
            setSearchOpen(true);
            setSearchQuery('');
            setAddError(null);
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
            const total = observed.reduce((n, x) => n + x.devices.length, 0) + u.devices.length;
            if (total > MAX_OBSERVED_DEVICES) {
                setAddError(
                    `관측 디바이스 상한(${MAX_OBSERVED_DEVICES}개)을 초과합니다 — 기존 유저를 해제한 뒤 추가하세요`
                );
                return;
            }
            setAddError(null);
            setObserved(prev => [...prev, u]);
            setSelectedUserId(u.id);
            void refreshPresence(u.id);
        },
    };
};
