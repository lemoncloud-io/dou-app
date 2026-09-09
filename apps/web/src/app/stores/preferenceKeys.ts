// ---------------------------------------------------------------------------
// Domain constants/types shared by the `ui.*` config keys (see libs/config/src/registry/ui.ts) and
// their consumers. Storage/lane/persistence strategy now lives in the registry itself
// (ADR-0079/0080) — this file only keeps what has nothing to do with where a value is stored.
// ---------------------------------------------------------------------------

/** Theme preference value — 'system' resolves against the OS color scheme at runtime. */
export type Theme = 'dark' | 'light' | 'system';

/** Channel-list sort method, chosen per place. 'recent' matches the pre-setting default. */
export type ChannelSortMethod = 'recent' | 'unread';

/** Default channel sort when a place has no stored preference. */
export const DEFAULT_CHANNEL_SORT: ChannelSortMethod = 'recent';

/** How long a dismissed cloud-promo banner stays hidden before it is shown again (24h, ADR-0034). */
export const CLOUD_PROMO_DISMISS_TTL_MS = 24 * 60 * 60 * 1000;

/** Max recent search keywords retained, most-recent first (see setRecentSearches). */
export const MAX_RECENT_SEARCHES = 10;

/**
 * Scope key for the per-place client preferences (channel sort, pinned channels).
 *
 * A site id is only unique WITHIN its cloud, so these preferences are keyed by `<cid>:<sid>` —
 * otherwise the same place id in another cloud would silently inherit the first cloud's sort order
 * and pins. Returns null when either half is unknown; callers then fall back to defaults and skip
 * the write rather than storing a half-formed key.
 */
export const placeScopeKey = (cloudId?: string | null, placeId?: string | null): string | null =>
    cloudId && placeId ? `${cloudId}:${placeId}` : null;

/** A stored key belongs to the current scheme only if it carries both halves. */
export const isPlaceScopeKey = (key: string): boolean => key.includes(':');
