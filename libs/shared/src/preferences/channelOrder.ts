import { useCallback, useMemo } from 'react';

import { config } from '@chatic/config';
import { useConfigValue } from '@chatic/config/react';

import { isPlaceScopeKey } from './placeScope';

// ---------------------------------------------------------------------------
// `ui.channelOrder` — a per-place array holding the full non-favorite sidebar
// order (channels then DMs, concatenated). One array because a move rewrites
// only the moved section's slice; the other section's ids keep their positions.
//
// Same split as pinnedChannels: `@chatic/config` validates JSON shape only —
// the "scope must be cid:sid, members must be channel ids" product shape is
// normalized here, on the already-decoded value.
// ---------------------------------------------------------------------------

/**
 * Keep only recognized per-place values, so a corrupt/tampered entry degrades
 * to "no custom order" instead of breaking the sidebar. Bare-placeId scopes are
 * dropped for the same reason as `normalizePinnedChannels`: they can't be
 * attributed to a cloud. Empty scopes are dropped to keep the stored map minimal.
 * Duplicate ids are collapsed — a hand-edited record must not become duplicate
 * React keys / dnd-kit ids (review-03 P2).
 */
export const normalizeChannelOrder = (value: unknown): Record<string, string[]> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const result: Record<string, string[]> = {};
    for (const [scope, ids] of Object.entries(value)) {
        if (!isPlaceScopeKey(scope) || !Array.isArray(ids)) continue;
        const channelIds = [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))];
        if (channelIds.length > 0) result[scope] = channelIds;
    }
    return result;
};

/**
 * Apply a stored order to the current channel list: stored ids that are still
 * present first, in stored order; everything else (new/unknown ids) appended in
 * incoming order, which is the list's own (name) order.
 */
export const applyChannelOrder = (ids: readonly string[], stored: readonly string[] | undefined): string[] => {
    if (!stored || stored.length === 0) return [...ids];
    const present = new Set(ids);
    const kept = stored.filter(id => present.has(id));
    if (kept.length === 0) return [...ids];
    const seen = new Set(kept);
    return [...kept, ...ids.filter(id => !seen.has(id))];
};

/**
 * Move one id to `toIndex` and prune ids no longer present, in one write — a
 * drag in a section that still contains a removed channel's id cleans it up on
 * the spot. `toIndex` clamps to the ends; an id outside the pruned list only
 * prunes. Returns a new array; never mutates.
 */
export const moveChannel = (
    order: readonly string[],
    id: string,
    toIndex: number,
    presentIds: readonly string[]
): string[] => {
    const present = new Set(presentIds);
    const kept = order.filter(candidate => present.has(candidate));
    const from = kept.indexOf(id);
    if (from < 0) return kept;
    const clamped = Math.max(0, Math.min(kept.length - 1, toIndex));
    const next = [...kept];
    next.splice(from, 1);
    next.splice(clamped, 0, id);
    return next;
};

/**
 * Persist one scope's full non-favorite order. Other scopes are preserved; a
 * scope left with nothing is dropped, matching `setChannelPinned`.
 */
export const setChannelOrder = (scope: string, channelIds: string[]): void => {
    const current = normalizeChannelOrder(config.get('ui.channelOrder'));
    const orderedIds = [...new Set(channelIds)];
    const next = { ...current };
    if (orderedIds.length > 0) next[scope] = orderedIds;
    else delete next[scope];
    config.set('ui.channelOrder', next, { lane: 'local' });
};

/**
 * Read/write one place's stored channel order. `scope` null (cloud or place not
 * settled yet) yields an empty list and turns the writer into a no-op — a
 * half-formed key must never be written.
 */
export const useChannelOrder = (scope: string | null) => {
    const raw = useConfigValue<Record<string, string[]>>('ui.channelOrder');
    const storedIds = useMemo(() => (scope ? (normalizeChannelOrder(raw ?? {})[scope] ?? []) : []), [raw, scope]);

    const set = useCallback(
        (channelIds: string[]) => {
            if (!scope) return;
            setChannelOrder(scope, channelIds);
        },
        [scope]
    );

    return { storedIds, set };
};
