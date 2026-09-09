import { config } from '@chatic/config';
import { useConfigValue } from '@chatic/config/react';
import { normalizePinnedChannels } from '../stores/preferenceParsers';

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

export const usePinnedChannels = () => {
    const raw = useConfigValue<Record<string, string[]>>('ui.pinnedChannels');
    return { pinnedChannels: normalizePinnedChannels(raw ?? {}), setChannelPinned };
};
