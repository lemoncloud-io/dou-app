import { useCallback, useMemo } from 'react';

import { config } from '@chatic/config';
import { useConfigValue } from '@chatic/config/react';

import { isPlaceScopeKey } from './placeScope';

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

export const setChannelPinned = (scope: string, channelId: string, pinned: boolean): void => {
    const current = normalizePinnedChannels(config.get('ui.pinnedChannels'));
    const existingIds = current[scope] ?? [];
    const channelIds = pinned ? [...new Set([...existingIds, channelId])] : existingIds.filter(id => id !== channelId);

    const next = { ...current };
    if (channelIds.length > 0) next[scope] = channelIds;
    else delete next[scope];

    config.set('ui.pinnedChannels', next, { lane: 'local' });
};

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
