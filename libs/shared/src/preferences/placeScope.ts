// ---------------------------------------------------------------------------
// Scope key for the per-place client preferences (`ui.pinnedChannels`, `ui.channelOrder` —
// see libs/config/src/registry/ui.ts).
//
// Shared by both apps so desktop-web reads the SAME record apps/web writes instead of keeping
// a local twin (CLAUDE.md "read the engine's record, not a local twin").
// ---------------------------------------------------------------------------

/**
 * A site id is only unique WITHIN its cloud, so these preferences are keyed by `<cid>:<sid>` —
 * otherwise the same place id in another cloud would silently inherit the first cloud's pins
 * and order. Returns null when either half is unknown; callers then fall back to defaults and
 * skip the write rather than storing a half-formed key.
 */
export const placeScopeKey = (cloudId?: string | null, placeId?: string | null): string | null =>
    cloudId && placeId ? `${cloudId}:${placeId}` : null;

/** A stored key belongs to the current scheme only if it carries both halves. */
export const isPlaceScopeKey = (key: string): boolean => key.includes(':');
