import { useCallback, useMemo } from 'react';

import { config } from '@chatic/config';
import { useConfigValue } from '@chatic/config/react';

import { isPlaceScopeKey } from './placeScope';

// ---------------------------------------------------------------------------
// `ui.pinnedChannels` — an ordered per-place array of pinned ("favorite") channel ids.
//
// `@chatic/config` only validates that a `type: 'json'` value is parseable JSON — it has no way
// to know a "pinned channels map" must have non-empty string arrays keyed by cid:sid. That
// product-shape validation lives here, applied to whatever `config.get()`/`useConfigValue()`
// returns (already-decoded, so these take the real value, not a raw string).
// ---------------------------------------------------------------------------

/**
 * Keep only recognized per-place values, so a corrupt/tampered entry can't break the favorites
 * section — it degrades to "nothing pinned". Legacy entries keyed by a bare placeId are dropped:
 * they can't be attributed to a cloud, so honoring them would leak one cloud's pins into
 * another's same-id place.
 */
export const normalizePinnedChannels = (value: unknown): Record<string, string[]> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const result: Record<string, string[]> = {};
    for (const [scope, ids] of Object.entries(value)) {
        if (!isPlaceScopeKey(scope) || !Array.isArray(ids)) continue;
        const channelIds = ids.filter((id): id is string => typeof id === 'string' && id.length > 0);
        if (channelIds.length > 0) result[scope] = channelIds;
    }
    return result;
};

export const parsePinnedChannels = (raw: string): Record<string, string[]> => {
    try {
        return normalizePinnedChannels(JSON.parse(raw));
    } catch {
        return {};
    }
};

/**
 * `ui.pinnedChannels` is `persist: 'local'`, `writableBy: ['local']` — same reasoning as
 * `setChannelSort`. Pins/unpins one channel within a place scope; other scopes are preserved, and a
 * scope with nothing pinned left is dropped entirely so the stored map stays minimal.
 */
export const setChannelPinned = (scope: string, channelId: string, pinned: boolean): void => {
    const current = normalizePinnedChannels(config.get('ui.pinnedChannels'));
    const existingIds = current[scope] ?? [];
    const channelIds = pinned ? [...new Set([...existingIds, channelId])] : existingIds.filter(id => id !== channelId);

    const next = { ...current };
    if (channelIds.length > 0) next[scope] = channelIds;
    else delete next[scope];

    config.set('ui.pinnedChannels', next, { lane: 'local' });
};

/**
 * Rewrite one scope's pin order (drag/keyboard reorder of the Favorites section). `channelIds` is
 * the new order of the pins on screen: each slot a listed pin held takes the next id of that
 * order, and pins not listed keep their slot — a channel briefly missing from the list (rejoin,
 * sync lag) must not lose its pin to a reorder. Ids not already pinned in that scope are dropped
 * — reordering must never silently pin a channel. A scope left with nothing is dropped, matching
 * `setChannelPinned`.
 */
export const setPinnedChannelOrder = (scope: string, channelIds: string[]): void => {
    const current = normalizePinnedChannels(config.get('ui.pinnedChannels'));
    const stored = current[scope] ?? [];
    const known = new Set(stored);
    const reordered = [...new Set(channelIds)].filter(id => known.has(id));
    const moved = new Set(reordered);
    let slot = 0;
    const nextIds = stored.map(id => (moved.has(id) ? reordered[slot++] : id));

    const next = { ...current };
    if (nextIds.length > 0) next[scope] = nextIds;
    else delete next[scope];

    config.set('ui.pinnedChannels', next, { lane: 'local' });
};

/**
 * Read/write the favorites of ONE place. `scope` null (cloud or place not settled yet) yields an
 * empty list and turns both writers into no-ops — a half-formed key must never be written.
 * `pinnedIds` order is the display order of the Favorites section.
 */
export const usePinnedChannels = (scope: string | null) => {
    const raw = useConfigValue<Record<string, string[]>>('ui.pinnedChannels');
    const pinnedIds = useMemo(() => (scope ? (normalizePinnedChannels(raw ?? {})[scope] ?? []) : []), [raw, scope]);

    const toggle = useCallback(
        (channelId: string) => {
            if (!scope) return;
            setChannelPinned(scope, channelId, !pinnedIds.includes(channelId));
        },
        [scope, pinnedIds]
    );

    const reorder = useCallback(
        (channelIds: string[]) => {
            if (!scope) return;
            setPinnedChannelOrder(scope, channelIds);
        },
        [scope]
    );

    return { pinnedIds, toggle, reorder };
};
