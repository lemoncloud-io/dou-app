import type { ChannelView } from '@lemoncloud/chatic-socials-api';
import { clearCachedInitData, getCachedInitData } from '@chatic/web-core';

import { IndexedDBChannelAdapter } from '../../chats/storages/IndexedDBChannelAdapter';
import { CHANNELS_BROADCAST_CHANNEL_NAME } from '../../chats/storages/IndexedDBStorageAdapter';
import { deduplicateById, isReactNativeWebView, sortChannelsByLatest } from './channelTypes';
import { getProfileId, getState, transition, updateChannelsSilently } from './channelState';

// ── Injected Cache Hydration ─────────────────────────────────────────────────

let cacheLoaded = false;

export const hydrateFromInjectedCache = (): boolean => {
    if (cacheLoaded) return getState().channels.length > 0;
    if (typeof window === 'undefined' || !isReactNativeWebView()) return false;

    const cached = getCachedInitData();
    if (!cached || cached.channels.length === 0) return false;

    const unique = deduplicateById(cached.channels as ChannelView[]);
    if (unique.length === 0) return false;

    cacheLoaded = true;
    transition({ status: 'cached', channels: unique, retryCount: 0 });
    clearCachedInitData();
    return true;
};

// Best-effort at module evaluation time
hydrateFromInjectedCache();

// ── IndexedDB Cache ──────────────────────────────────────────────────────────

export const loadCachedChannels = (userId: string) => {
    if (cacheLoaded || isReactNativeWebView()) return;
    cacheLoaded = true;

    IndexedDBChannelAdapter.loadAll(userId)
        .then(cachedChannels => {
            if (cachedChannels.length > 0 && getState().status === 'loading') {
                transition({ channels: cachedChannels });
            }
        })
        .catch(error => console.error('Failed to load cached channels:', error));
};

export const resetCacheLoaded = () => {
    cacheLoaded = false;
};

// ── BroadcastChannel (Cross-Tab Sync) ────────────────────────────────────────

if (typeof BroadcastChannel !== 'undefined' && !isReactNativeWebView()) {
    const bc = new BroadcastChannel(CHANNELS_BROADCAST_CHANNEL_NAME);
    bc.onmessage = event => {
        const { type, userId, channels, channel, channelId } = event.data;
        if (userId !== getProfileId()) return;

        switch (type) {
            case 'channels-updated':
                updateChannelsSilently(channels);
                break;
            case 'channel-saved': {
                const current = getState().channels;
                const exists = current.some(ch => ch.id === channel.id);
                const updated = exists
                    ? current.map(ch => (ch.id === channel.id ? channel : ch))
                    : [...current, channel];
                transition({ channels: sortChannelsByLatest(updated) });
                break;
            }
            case 'channel-removed':
                transition({ channels: getState().channels.filter(ch => ch.id !== channelId) });
                break;
        }
    };
}
