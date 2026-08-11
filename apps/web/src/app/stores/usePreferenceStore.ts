import { create } from 'zustand';
import { isNative } from '@chatic/bridges';
import type { PreferenceKey } from '@chatic/app-messages';

import { appBridge } from '../bridge';
import { MAX_RECENT_SEARCHES, PREFERENCES } from './preferenceKeys';
import { isPlaceScopeKey } from './preferenceKeys';
import type { ChannelSortMethod, Theme } from './preferenceKeys';

// ---------------------------------------------------------------------------
// Storage model
//
// localStorage / sessionStorage is a synchronous L1 cache; the native bridge
// is the persistent store that survives a WebView cache wipe. The two layers
// are no longer either/or — a write goes to both, a read prefers the cache.
//
//   Write:  update store -> write local cache -> (if bridge) push to bridge
//   Read:   local cache -> (missing && bridge) fetch from bridge -> default
// ---------------------------------------------------------------------------

/** Raw stored string for a key, or null when nothing is cached locally yet. */
const readLocalPreference = (name: keyof typeof PREFERENCES): string | null => {
    if (typeof window === 'undefined') return null;
    const config = PREFERENCES[name];
    if (config.strategy === 'session') return sessionStorage.getItem(config.sessionKey);
    return localStorage.getItem(config.localKey);
};

/** Synchronous initial value: local cache when present, otherwise the default. */
const readPreference = (name: keyof typeof PREFERENCES): string =>
    readLocalPreference(name) ?? PREFERENCES[name].defaultValue;

/** Whether a value is already cached locally — used to decide bridge fallback reads. */
export const hasLocalPreference = (name: keyof typeof PREFERENCES): boolean => readLocalPreference(name) !== null;

/** Write a value into the local cache only (no bridge round-trip). */
const cacheLocalPreference = (name: keyof typeof PREFERENCES, value: string): void => {
    if (typeof window === 'undefined') return;
    const config = PREFERENCES[name];
    if (config.strategy === 'session') sessionStorage.setItem(config.sessionKey, value);
    else localStorage.setItem(config.localKey, value);
};

/**
 * Persist a write to every backing layer:
 *   1. local cache (synchronous source for the next read)
 *   2. native bridge — only for native+local keys when running on native, so
 *      the value survives a WebView cache wipe.
 */
const persistPreference = (name: keyof typeof PREFERENCES, value: string): void => {
    const config = PREFERENCES[name];
    cacheLocalPreference(name, value);
    if (config.strategy === 'native+local' && isNative()) {
        appBridge.savePreference({ key: config.nativeKey, value });
    }
};

// ---------------------------------------------------------------------------
// Theme parsing
// ---------------------------------------------------------------------------

/**
 * Parse the stored channel-sort JSON map. A corrupt or non-object value resets to an empty
 * map so a single bad write can never break the channel list — places just fall back to the
 * default sort. Unknown per-place values are read back verbatim and normalized at read time.
 */
const VALID_CHANNEL_SORTS: readonly ChannelSortMethod[] = ['recent', 'unread'];

export const parseChannelSort = (raw: string): Record<string, ChannelSortMethod> => {
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        // Keep only recognized per-place values so a corrupt/tampered entry can't leave the sort
        // picker with no selection or feed an unknown method downstream.
        const result: Record<string, ChannelSortMethod> = {};
        for (const [scope, method] of Object.entries(parsed)) {
            // Legacy entries keyed by a bare placeId are dropped: they can't be attributed to a
            // cloud, so honoring them would leak one cloud's sort into another's same-id place.
            if (isPlaceScopeKey(scope) && VALID_CHANNEL_SORTS.includes(method as ChannelSortMethod)) {
                result[scope] = method as ChannelSortMethod;
            }
        }
        return result;
    } catch {
        return {};
    }
};

/**
 * Parse the stored pinned-channel JSON map (placeId → channelId[]). Anything that isn't an array
 * of non-empty strings is dropped, so a corrupt write degrades to "nothing pinned" rather than
 * breaking the channel list ordering.
 */
/**
 * A stored JSON array of ids. Anything else — a corrupt value, a non-array, non-string members —
 * degrades to "nothing recorded" rather than throwing, matching the other parsers here.
 */
export const parseInviteIds = (raw: string): string[] => {
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
    } catch {
        return [];
    }
};

export const parsePinnedChannels = (raw: string): Record<string, string[]> => {
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        const result: Record<string, string[]> = {};
        for (const [scope, ids] of Object.entries(parsed)) {
            // Same as channelSort: legacy bare-placeId entries are dropped rather than migrated.
            if (!isPlaceScopeKey(scope) || !Array.isArray(ids)) continue;
            const channelIds = ids.filter((id): id is string => typeof id === 'string' && id.length > 0);
            if (channelIds.length > 0) result[scope] = channelIds;
        }
        return result;
    } catch {
        return {};
    }
};

/**
 * Parse the stored cloud-promo dismiss timestamp into epoch ms, or 0 for "never dismissed".
 *
 * Anything unusable degrades to 0 so the banner SHOWS rather than staying hidden: a corrupt write
 * must not be able to suppress it permanently. A timestamp in the future is treated the same way —
 * it can only come from a clock change or a bad write, and honouring it would hide the banner for
 * as long as that future date is away.
 */
export const parseCloudPromoDismissedAt = (raw: string, now: number = Date.now()): number => {
    const parsed = Number(raw);
    if (!raw || !Number.isFinite(parsed) || parsed <= 0) return 0;
    return parsed > now ? 0 : parsed;
};

/**
 * Parse the stored recent-search JSON array. A corrupt or non-array value resets to an
 * empty list so a single bad write can never break the search page — it just starts with
 * no history. Non-string entries are dropped rather than failing the whole parse.
 */
export const parseRecentSearches = (raw: string): string[] => {
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((item): item is string => typeof item === 'string');
    } catch {
        return [];
    }
};

const THEME_VALUES: readonly string[] = ['dark', 'light', 'system'];

/**
 * Normalize a raw stored theme into a valid Theme, or null when unrecognized.
 *
 * Two shapes must be accepted: the plain string this store writes ('dark'),
 * and the zustand-persist JSON envelope the mobile app stores under the same
 * native key ({"state":{"theme":"dark"},"version":0}) — a bridge fetch on
 * native returns whichever shape was persisted last.
 */
export const parseTheme = (value: unknown): Theme | null => {
    if (typeof value !== 'string') return null;
    if (THEME_VALUES.includes(value)) return value as Theme;
    try {
        const inner = JSON.parse(value)?.state?.theme;
        return typeof inner === 'string' && THEME_VALUES.includes(inner) ? (inner as Theme) : null;
    } catch {
        return null;
    }
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface PreferenceState {
    blurLastMessage: boolean;
    /** true until the user completes onboarding for the first time. */
    isFirstRun: boolean;
    /** Theme preference; 'system' resolves against the OS scheme (see app/theme). */
    theme: Theme;
    /** Device-global push mute (optimistic local mirror of device.update-remote; no server read). */
    pushMuted: boolean;
    /** Channel sort method per `<cid>:<sid>` scope (placeScopeKey). Missing → DEFAULT_CHANNEL_SORT. */
    channelSort: Record<string, ChannelSortMethod>;
    /** Pinned channel ids per `<cid>:<sid>` scope (placeScopeKey). Client-only (no server pin field). */
    pinnedChannels: Record<string, string[]>;
    /** Live store version the update prompt was last dismissed for; '' means never dismissed. */
    dismissedUpdateVersion: string;
    /** Locally hidden sent-invite ids — rejected-row dismisses and legacy pre-API cancel stamps (ADR-0043). */
    canceledInviteIds: string[];
    /** Epoch ms the cloud-promo banner was last dismissed; 0 means never (see parseCloudPromoDismissedAt). */
    cloudPromoDismissedAt: number;
    /** Recent search keywords, most-recent first, capped at MAX_RECENT_SEARCHES. */
    recentSearches: string[];
}

interface PreferenceActions {
    setBlurLastMessage: (value: boolean) => void;
    completeOnboarding: () => void;
    resetOnboarding: () => void;
    setTheme: (theme: Theme) => void;
    /** Optimistically mirror the device push-mute write (source of truth is device.update-remote). */
    setPushMuted: (value: boolean) => void;
    /** Set the sort method for one place scope (placeScopeKey); other scopes are preserved. */
    setChannelSort: (scope: string, method: ChannelSortMethod) => void;
    /** Pin/unpin one channel within a place scope (placeScopeKey); other scopes are preserved. */
    setChannelPinned: (scope: string, channelId: string, pinned: boolean) => void;
    /** Mark the update prompt as dismissed for the given live version; suppresses it until a newer version appears. */
    dismissUpdate: (version: string) => void;
    /** Hide a sent invite on this device (rejected-row dismiss; legacy pre-API cancel stamps). Idempotent. */
    markInviteCanceled: (inviteId: string) => void;
    /** Drop one hidden-invite record — the reconcile pass calls this once the server state is settled. */
    clearInviteCanceled: (inviteId: string) => void;
    /**
     * Record "dismissed now" for the cloud-promo banner. Expiry is NOT enforced here — readers
     * compare the timestamp against CLOUD_PROMO_DISMISS_TTL_MS (see features/home/hooks/useCloudPromo).
     */
    dismissCloudPromo: () => void;
    /** Add a keyword to recent searches (moves to front if already present, capped list). */
    addRecentSearch: (keyword: string) => void;
    /** Remove a single keyword from recent searches. */
    removeRecentSearch: (keyword: string) => void;
    /** Clear all recent searches. */
    clearRecentSearches: () => void;
    /**
     * Override store values from the bridge fallback read (native FetchPreference).
     * Called by PreferenceLoader only when the local cache is empty; also seeds the
     * local cache so subsequent reads are synchronous. Do not call in product code.
     */
    hydrate: (key: PreferenceKey, value: unknown) => void;
}

export const usePreferenceStore = create<PreferenceState & PreferenceActions>()((set, get) => ({
    // Initial values read from the local cache synchronously (avoids initial flash).
    // On native, PreferenceLoader fills in any key missing from the cache from the bridge.
    blurLastMessage: readPreference('blurLastMessage') === 'true',

    // isFirstRun is the inverse of the 'completed' flag stored in localStorage.
    isFirstRun: readPreference('isFirstRun') !== 'true',

    // A corrupt cached value falls back to 'system' rather than leaking into the DOM class.
    theme: parseTheme(readPreference('theme')) ?? 'system',

    pushMuted: readPreference('pushMuted') === 'true',

    channelSort: parseChannelSort(readPreference('channelSort')),

    pinnedChannels: parsePinnedChannels(readPreference('pinnedChannels')),

    dismissedUpdateVersion: readPreference('dismissedUpdateVersion'),

    canceledInviteIds: parseInviteIds(readPreference('canceledInvites')),

    cloudPromoDismissedAt: parseCloudPromoDismissedAt(readPreference('cloudPromoDismissedAt')),

    recentSearches: parseRecentSearches(readPreference('recentSearches')),

    setBlurLastMessage: (value: boolean) => {
        set({ blurLastMessage: value });
        persistPreference('blurLastMessage', value ? 'true' : 'false');
    },

    completeOnboarding: () => {
        set({ isFirstRun: false });
        persistPreference('isFirstRun', 'true');
    },

    resetOnboarding: () => {
        set({ isFirstRun: true });
        persistPreference('isFirstRun', 'false');
    },

    setTheme: (theme: Theme) => {
        set({ theme });
        persistPreference('theme', theme);
    },

    setPushMuted: (value: boolean) => {
        set({ pushMuted: value });
        persistPreference('pushMuted', value ? 'true' : 'false');
    },

    setChannelSort: (scope: string, method: ChannelSortMethod) => {
        // Merge into the existing map so switching one place's sort never drops another's.
        const next = { ...get().channelSort, [scope]: method };
        set({ channelSort: next });
        persistPreference('channelSort', JSON.stringify(next));
    },

    setChannelPinned: (scope: string, channelId: string, pinned: boolean) => {
        const current = get().pinnedChannels[scope] ?? [];
        const channelIds = pinned ? [...new Set([...current, channelId])] : current.filter(id => id !== channelId);
        // Drop the scope entry entirely once nothing is pinned, so the stored map stays minimal.
        const next = { ...get().pinnedChannels };
        if (channelIds.length > 0) next[scope] = channelIds;
        else delete next[scope];
        set({ pinnedChannels: next });
        persistPreference('pinnedChannels', JSON.stringify(next));
    },

    dismissUpdate: (version: string) => {
        set({ dismissedUpdateVersion: version });
        persistPreference('dismissedUpdateVersion', version);
    },

    markInviteCanceled: (inviteId: string) => {
        if (!inviteId || get().canceledInviteIds.includes(inviteId)) return;
        const next = [...get().canceledInviteIds, inviteId];
        set({ canceledInviteIds: next });
        persistPreference('canceledInvites', JSON.stringify(next));
    },

    clearInviteCanceled: (inviteId: string) => {
        if (!inviteId || !get().canceledInviteIds.includes(inviteId)) return;
        const next = get().canceledInviteIds.filter(id => id !== inviteId);
        set({ canceledInviteIds: next });
        persistPreference('canceledInvites', JSON.stringify(next));
    },

    dismissCloudPromo: () => {
        const dismissedAt = Date.now();
        set({ cloudPromoDismissedAt: dismissedAt });
        persistPreference('cloudPromoDismissedAt', String(dismissedAt));
    },

    addRecentSearch: (keyword: string) => {
        const trimmed = keyword.trim();
        if (!trimmed) return;
        // Dedupe case-insensitively so 'Lemon' and 'lemon' don't both show up, then move
        // the newest form to the front.
        const withoutDuplicate = get().recentSearches.filter(
            existing => existing.toLowerCase() !== trimmed.toLowerCase()
        );
        const next = [trimmed, ...withoutDuplicate].slice(0, MAX_RECENT_SEARCHES);
        set({ recentSearches: next });
        persistPreference('recentSearches', JSON.stringify(next));
    },

    removeRecentSearch: (keyword: string) => {
        const next = get().recentSearches.filter(existing => existing !== keyword);
        set({ recentSearches: next });
        persistPreference('recentSearches', JSON.stringify(next));
    },

    clearRecentSearches: () => {
        set({ recentSearches: [] });
        persistPreference('recentSearches', JSON.stringify([]));
    },

    hydrate: (key: PreferenceKey, value: unknown) => {
        // Bridge fallback values arrive here via PreferenceLoader when the local cache was empty.
        const bool = value === true || value === 'true';
        if (key === PREFERENCES.blurLastMessage.nativeKey) {
            set({ blurLastMessage: bool });
            cacheLocalPreference('blurLastMessage', bool ? 'true' : 'false');
        } else if (key === PREFERENCES.isFirstRun.nativeKey) {
            set({ isFirstRun: bool });
            cacheLocalPreference('isFirstRun', bool ? 'true' : 'false');
        } else if (key === PREFERENCES.theme.nativeKey) {
            // An unparseable bridge value is ignored — the synchronous 'system' default stands.
            const theme = parseTheme(value);
            if (theme) {
                set({ theme });
                cacheLocalPreference('theme', theme);
            }
        }
    },
}));
