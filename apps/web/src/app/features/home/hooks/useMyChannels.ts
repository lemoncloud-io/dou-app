import { useEffect, useState } from 'react';

import { useWebSocketV2, useWebSocketV2Store } from '@chatic/socket';
import { clearCachedInitData, cloudCore, getCachedInitData, useDynamicProfile } from '@chatic/web-core';
import type { ChannelView } from '@lemoncloud/chatic-socials-api';
import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';

import { IndexedDBChannelAdapter } from '../../chats/storages/IndexedDBChannelAdapter';
import { CHANNELS_BROADCAST_CHANNEL_NAME } from '../../chats/storages/IndexedDBStorageAdapter';

// ── Helpers (must be defined before module-level hydration call) ──────────────

const isReactNativeWebView = (): boolean => !!(window as Window & { ReactNativeWebView?: unknown }).ReactNativeWebView;

const getChannelSortTime = (channel: ChannelView): number =>
    channel.lastChat$?.createdAt ?? channel.updatedAt ?? channel.createdAt ?? 0;

const sortChannelsByLatest = (channels: ChannelView[]): ChannelView[] =>
    [...channels].sort((a, b) => getChannelSortTime(b) - getChannelSortTime(a));

const deduplicateById = (channels: ChannelView[]): ChannelView[] => {
    const seen = new Set<string>();
    return channels.filter(ch => {
        if (!ch.id || seen.has(ch.id)) return false;
        seen.add(ch.id);
        return true;
    });
};

// ── Singleton State ──────────────────────────────────────────────────────────

let globalChannels: ChannelView[] = [];
let globalIsLoading = true;
let globalIsError = false;
const listeners: Set<() => void> = new Set();
let isBootstrapped = false;
let isCacheLoaded = false;
let globalEmitAuthenticated: ((msg: object) => void) | null = null;
let globalProfileId = '';

// ── Cache Hydration ──────────────────────────────────────────────────────────

const hydrateFromInjectedCache = (): boolean => {
    if (isCacheLoaded) return globalChannels.length > 0;
    if (typeof window === 'undefined' || !isReactNativeWebView()) return false;

    const cached = getCachedInitData();
    if (!cached || cached.channels.length === 0) return false;

    const unique = deduplicateById(cached.channels as ChannelView[]);
    if (unique.length === 0) return false;

    globalChannels = sortChannelsByLatest(unique);
    globalIsLoading = false;
    isCacheLoaded = true;
    clearCachedInitData();
    return true;
};

// Best-effort at module evaluation time
hydrateFromInjectedCache();

// ── Constants & Timers ───────────────────────────────────────────────────────

const BOOTSTRAP_TIMEOUT_MS = 10_000;
const MAX_BOOTSTRAP_RETRIES = 2;
let bootstrapRetryCount = 0;
let bootstrapTimeoutId: ReturnType<typeof setTimeout> | null = null;

// ── Internal Functions ───────────────────────────────────────────────────────

const notifyListeners = () => listeners.forEach(l => l());

const setGlobalState = (channels: ChannelView[], isLoading: boolean, isError: boolean, saveToDb = false) => {
    globalChannels = sortChannelsByLatest(channels);
    globalIsLoading = isLoading;
    globalIsError = isError;
    notifyListeners();

    if (saveToDb && globalProfileId && !isReactNativeWebView()) {
        IndexedDBChannelAdapter.saveAll(globalProfileId, globalChannels).catch(console.error);
    }
};

/** Update channels keeping isLoading=false — prevents skeleton flash during background refresh */
const setChannelsSilently = (channels: ChannelView[], saveToDb = false) => {
    setGlobalState(channels, false, false, saveToDb);
};

const loadCachedChannels = async (userId: string) => {
    if (isCacheLoaded || isReactNativeWebView()) return;
    isCacheLoaded = true;

    try {
        const cachedChannels = await IndexedDBChannelAdapter.loadAll(userId);
        if (cachedChannels.length > 0 && globalIsLoading) {
            globalChannels = sortChannelsByLatest(cachedChannels);
            notifyListeners();
        }
    } catch (error) {
        console.error('Failed to load cached channels:', error);
    }
};

const clearBootstrapTimeout = () => {
    if (bootstrapTimeoutId) {
        clearTimeout(bootstrapTimeoutId);
        bootstrapTimeoutId = null;
    }
};

const emitMineRequest = () => {
    if (globalEmitAuthenticated) {
        globalEmitAuthenticated({ type: 'chat', action: 'mine', payload: { detail: true } });
    }
};

const scheduleBootstrapTimeout = () => {
    clearBootstrapTimeout();
    bootstrapTimeoutId = setTimeout(() => {
        if (!globalIsLoading) return;
        if (bootstrapRetryCount < MAX_BOOTSTRAP_RETRIES) {
            bootstrapRetryCount++;
            console.log(
                `[useMyChannels] Bootstrap timeout, retrying (${bootstrapRetryCount}/${MAX_BOOTSTRAP_RETRIES})`
            );
            emitMineRequest();
            scheduleBootstrapTimeout();
        } else {
            setGlobalState(globalChannels.length > 0 ? globalChannels : [], false, true);
        }
    }, BOOTSTRAP_TIMEOUT_MS);
};

const bootstrap = (emitAuthenticated: (msg: object) => void, profileId: string) => {
    if (isBootstrapped) return;
    isBootstrapped = true;
    bootstrapRetryCount = 0;

    loadCachedChannels(profileId);

    // Skip isLoading=true when cached channels already shown
    if (globalChannels.length === 0) {
        setGlobalState(globalChannels, true, false);
    }

    emitMineRequest();
    scheduleBootstrapTimeout();
};

// ── Socket Message Subscription ──────────────────────────────────────────────

useWebSocketV2Store.subscribe(
    s => s.lastMessage,
    lastMessage => {
        const envelope = lastMessage as WSSEnvelope<{
            list: ChannelView[];
            sourceType?: string;
            userId?: string;
            channelId?: string;
        }> | null;
        if (!envelope) return;

        if (envelope.type === 'model' && envelope.action === 'delete' && envelope.payload?.sourceType === 'join') {
            const { userId, channelId } = envelope.payload;
            if (userId === globalProfileId && channelId) {
                setChannelsSilently(
                    globalChannels.filter(ch => ch.id !== channelId),
                    true
                );
                if (!isReactNativeWebView()) {
                    IndexedDBChannelAdapter.remove(globalProfileId, channelId).catch(console.error);
                }
            }
            return;
        }

        if (
            envelope.type === 'model' &&
            envelope.action === 'update' &&
            (envelope.payload as { reason?: string })?.reason === 'channel-deleted'
        ) {
            const channelId = (envelope.payload as { channelId?: string })?.channelId;
            if (channelId) {
                setChannelsSilently(
                    globalChannels.filter(ch => ch.id !== channelId),
                    true
                );
                if (globalProfileId && !isReactNativeWebView()) {
                    IndexedDBChannelAdapter.remove(globalProfileId, channelId).catch(console.error);
                }
            }
            return;
        }

        if (envelope.action === 'update' && envelope.payload?.sourceType === 'channel') {
            // Background refresh — no skeleton
            emitMineRequest();
            return;
        }

        if (envelope.type !== 'chat') return;
        if (envelope.action === 'error') {
            clearBootstrapTimeout();
            setGlobalState([], false, true);
            return;
        }
        if (envelope.action !== 'mine') return;
        clearBootstrapTimeout();
        setChannelsSilently(envelope.payload?.list ?? [], true);
    }
);

// ── Lifecycle Subscriptions ──────────────────────────────────────────────────

const setChannels = (updater: ChannelView[] | ((prev: ChannelView[]) => ChannelView[])) => {
    const next = typeof updater === 'function' ? updater(globalChannels) : updater;
    setGlobalState(next, globalIsLoading, globalIsError);
};

const removeChannel = (channelId: string) => {
    setChannelsSilently(
        globalChannels.filter(ch => ch.id !== channelId),
        true
    );
    if (globalProfileId && !isReactNativeWebView()) {
        IndexedDBChannelAdapter.remove(globalProfileId, channelId).catch(console.error);
    }
};

useWebSocketV2Store.subscribe(
    s => s.isVerified,
    isVerified => {
        if (!isVerified || !globalEmitAuthenticated) return;
        const wssType = useWebSocketV2Store.getState().wssType;
        if (wssType === 'cloud' && !cloudCore.getSelectedPlaceId()) return;
        isBootstrapped = false;
        bootstrap(globalEmitAuthenticated, globalProfileId);
    }
);

useWebSocketV2Store.subscribe(
    s => s.isConnected,
    isConnected => {
        if (!isConnected) {
            isBootstrapped = false;
            isCacheLoaded = false;
            clearBootstrapTimeout();
        }
    }
);

// BroadcastChannel listener for cross-tab sync
// NOTE: Module-level listener intentionally not closed - singleton pattern for app lifetime
if (typeof BroadcastChannel !== 'undefined' && !isReactNativeWebView()) {
    const bc = new BroadcastChannel(CHANNELS_BROADCAST_CHANNEL_NAME);
    bc.onmessage = event => {
        const { type, userId, channels, channel, channelId } = event.data;
        if (userId !== globalProfileId) return;

        switch (type) {
            case 'channels-updated':
                globalChannels = sortChannelsByLatest(channels);
                globalIsLoading = false;
                globalIsError = false;
                notifyListeners();
                break;
            case 'channel-saved': {
                const updatedChannels = globalChannels.map(ch => (ch.id === channel.id ? channel : ch));
                if (!globalChannels.find(ch => ch.id === channel.id)) {
                    globalChannels = sortChannelsByLatest([...updatedChannels, channel]);
                } else {
                    globalChannels = sortChannelsByLatest(updatedChannels);
                }
                notifyListeners();
                break;
            }
            case 'channel-removed':
                globalChannels = globalChannels.filter(ch => ch.id !== channelId);
                notifyListeners();
                break;
        }
    };
}

// Foreground resync: re-bootstrap when app returns from background
if (typeof window !== 'undefined') {
    window.addEventListener('foreground-resync', () => {
        if (!globalEmitAuthenticated || !globalProfileId) return;
        isBootstrapped = false;
        isCacheLoaded = false;
        bootstrap(globalEmitAuthenticated, globalProfileId);
    });
}

const retryMine = () => {
    if (!globalEmitAuthenticated) return;
    setGlobalState([], true, false);
    emitMineRequest();
};

// ── Hook ─────────────────────────────────────────────────────────────────────

export const useMyChannels = () => {
    const { emitAuthenticated } = useWebSocketV2();
    const isVerified = useWebSocketV2Store(s => s.isVerified);
    const profile = useDynamicProfile();
    const [, forceUpdate] = useState({});

    globalEmitAuthenticated = emitAuthenticated;
    globalProfileId = profile?.uid ?? '';

    // Retry cache hydration during render (in case module-level missed it)
    hydrateFromInjectedCache();

    useEffect(() => {
        const listener = () => forceUpdate({});
        listeners.add(listener);
        const wssType = useWebSocketV2Store.getState().wssType;
        const hasPlace = wssType !== 'cloud' || !!cloudCore.getSelectedPlaceId();
        if (isVerified && globalEmitAuthenticated && !isBootstrapped && hasPlace) {
            bootstrap(globalEmitAuthenticated, globalProfileId);
        }
        return () => {
            listeners.delete(listener);
        };
    }, [profile?.uid, isVerified]);

    return {
        channels: globalChannels,
        isLoading: globalIsLoading,
        isError: globalIsError,
        setChannels,
        removeChannel,
        retry: retryMine,
    };
};
