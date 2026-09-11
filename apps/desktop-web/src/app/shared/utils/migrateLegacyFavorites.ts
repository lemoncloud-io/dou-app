import { config } from '@chatic/config';
import { normalizePinnedChannels } from '@chatic/shared';

const LEGACY_KEY = 'chatic-favorite-channels';

/**
 * One-way lazy move of the old `chatic-favorite-channels` zustand record (desktop-local
 * favorites, `Record<channelId, true>`) into the shared `ui.pinnedChannels[scope]` record.
 *
 * Legacy ids carry no place, so a device can hold favorites of several places under one key.
 * Migration therefore happens per place, from ChannelList, when that place's channel list is on
 * screen: only ids this place can confirm are moved (appended, deduped); the rest stay in the
 * old key until their own place is viewed. When nothing is left the key is removed — no lasting
 * legacy path. A corrupt envelope is removed rather than thrown on: favorites are a client
 * preference, losing them must never break the sidebar.
 */
export const migrateLegacyFavorites = (scope: string | null, channelIds: readonly string[]): void => {
    if (typeof window === 'undefined' || !scope) return;
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return;

    let legacyIds: Record<string, true> = {};
    try {
        const ids = JSON.parse(raw)?.state?.ids;
        if (ids && typeof ids === 'object' && !Array.isArray(ids)) legacyIds = ids;
    } catch {
        // Corrupt JSON: nothing salvageable — the key is removed below like any drained key.
    }

    const present = new Set(channelIds);
    const moved = Object.keys(legacyIds).filter(id => legacyIds[id] === true && present.has(id));
    const remainingIds = Object.fromEntries(Object.entries(legacyIds).filter(([id]) => !moved.includes(id)));

    if (moved.length > 0) {
        const current = normalizePinnedChannels(config.get('ui.pinnedChannels'));
        config.set(
            'ui.pinnedChannels',
            { ...current, [scope]: [...new Set([...(current[scope] ?? []), ...moved])] },
            { lane: 'local' }
        );
    }

    if (Object.keys(remainingIds).length > 0) {
        localStorage.setItem(LEGACY_KEY, JSON.stringify({ state: { ids: remainingIds }, version: 0 }));
    } else {
        localStorage.removeItem(LEGACY_KEY);
    }
};
