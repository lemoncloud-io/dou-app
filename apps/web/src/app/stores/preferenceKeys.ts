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

// placeScopeKey/isPlaceScopeKey moved to @chatic/shared (libs/shared/src/preferences/placeScope.ts)
// — desktop-web favorites now read the same per-place record apps/web writes.
