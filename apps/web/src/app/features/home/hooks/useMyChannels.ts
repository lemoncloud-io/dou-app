import { useEffect, useState } from 'react';

import { useWebSocketV2, useWebSocketV2Store } from '@chatic/socket';
import { cloudCore, useDynamicProfile } from '@chatic/web-core';
import type { ChannelView } from '@lemoncloud/chatic-socials-api';
import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';

import { IndexedDBChannelAdapter } from '../../chats/storages/IndexedDBChannelAdapter';
import { CHANNELS_BROADCAST_CHANNEL_NAME } from '../../chats/storages/IndexedDBStorageAdapter';

const isReactNativeWebView = (): boolean => !!(window as Window & { ReactNativeWebView?: unknown }).ReactNativeWebView;

// 싱글톤 상태
let globalChannels: ChannelView[] = [];
let globalIsLoading = true;
let globalIsError = false;
const listeners: Set<() => void> = new Set();
let isBootstrapped = false;
let isCacheLoaded = false;

const BOOTSTRAP_TIMEOUT_MS = 10_000;
const MAX_BOOTSTRAP_RETRIES = 2;
let bootstrapRetryCount = 0;
let bootstrapTimeoutId: ReturnType<typeof setTimeout> | null = null;

const notifyListeners = () => listeners.forEach(l => l());

const getChannelSortTime = (channel: ChannelView): number => {
    return channel.lastChat$?.createdAt ?? channel.updatedAt ?? channel.createdAt ?? 0;
};

const sortChannelsByLatest = (channels: ChannelView[]): ChannelView[] => {
    return [...channels].sort((a, b) => getChannelSortTime(b) - getChannelSortTime(a));
};

const setGlobalState = (channels: ChannelView[], isLoading: boolean, isError: boolean, saveToDb = false) => {
    globalChannels = sortChannelsByLatest(channels);
    globalIsLoading = isLoading;
    globalIsError = isError;
    notifyListeners();

    if (saveToDb && globalProfileId && !isReactNativeWebView()) {
        IndexedDBChannelAdapter.saveAll(globalProfileId, channels).catch(console.error);
    }
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
    setGlobalState(globalChannels, true, false);

    setTimeout(emitMineRequest, 500);
    scheduleBootstrapTimeout();
};

// Single message subscription (module-level, never duplicated)
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
                setGlobalState(
                    globalChannels.filter(ch => ch.id !== channelId),
                    false,
                    false,
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
                setGlobalState(
                    globalChannels.filter(ch => ch.id !== channelId),
                    false,
                    false,
                    true
                );
                if (globalProfileId && !isReactNativeWebView()) {
                    IndexedDBChannelAdapter.remove(globalProfileId, channelId).catch(console.error);
                }
            }
            return;
        }

        if (envelope.action === 'update' && envelope.payload?.sourceType === 'channel') {
            setGlobalState(globalChannels, true, false);
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
        setGlobalState(envelope.payload?.list ?? [], false, false, true);
    }
);

const setChannels = (updater: ChannelView[] | ((prev: ChannelView[]) => ChannelView[])) => {
    const next = typeof updater === 'function' ? updater(globalChannels) : updater;
    setGlobalState(next, globalIsLoading, globalIsError);
};

const removeChannel = (channelId: string) => {
    setGlobalState(
        globalChannels.filter(ch => ch.id !== channelId),
        false,
        false,
        true
    );
    if (globalProfileId && !isReactNativeWebView()) {
        IndexedDBChannelAdapter.remove(globalProfileId, channelId).catch(console.error);
    }
};

let globalEmitAuthenticated: ((msg: object) => void) | null = null;
let globalProfileId = '';

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

export const useMyChannels = () => {
    const { emitAuthenticated } = useWebSocketV2();
    const isVerified = useWebSocketV2Store(s => s.isVerified);
    const profile = useDynamicProfile();
    const [, forceUpdate] = useState({});

    globalEmitAuthenticated = emitAuthenticated;
    globalProfileId = profile?.uid ?? '';

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
