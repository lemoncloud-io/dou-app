const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

let cacheWasConsumed = false;

interface CachedInitData {
    channels: unknown[];
    clouds: unknown[];
    timestamp: number;
}

declare global {
    interface Window {
        CHATIC_CACHED_CHANNELS?: unknown[];
        CHATIC_CACHED_CLOUDS?: unknown[];
        CHATIC_CACHED_TIMESTAMP?: number;
    }
}

export const getCachedInitData = (): CachedInitData | null => {
    const timestamp = window.CHATIC_CACHED_TIMESTAMP;
    if (!timestamp) return null;

    const age = Date.now() - timestamp;
    if (age > MAX_CACHE_AGE_MS) return null;

    const channels = window.CHATIC_CACHED_CHANNELS ?? [];
    if (channels.length === 0) return null;

    return {
        channels,
        clouds: window.CHATIC_CACHED_CLOUDS ?? [],
        timestamp,
    };
};

/** Returns true when cache exists or was already consumed this session */
export const hasCachedInitData = (): boolean => {
    if (cacheWasConsumed) return true;
    const timestamp = window.CHATIC_CACHED_TIMESTAMP;
    if (!timestamp) return false;
    if (Date.now() - timestamp > MAX_CACHE_AGE_MS) return false;
    const channels = window.CHATIC_CACHED_CHANNELS;
    return Array.isArray(channels) && channels.length > 0;
};

export const clearCachedInitData = (): void => {
    cacheWasConsumed = true;
    delete window.CHATIC_CACHED_CHANNELS;
    delete window.CHATIC_CACHED_CLOUDS;
    delete window.CHATIC_CACHED_TIMESTAMP;
};
