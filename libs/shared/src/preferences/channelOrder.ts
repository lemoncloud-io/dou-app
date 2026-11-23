import { useCallback, useMemo } from 'react';

import { config } from '@chatic/config';
import { useConfigValue } from '@chatic/config/react';

import { isPlaceScopeKey } from './placeScope';

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

export const applyChannelOrder = (ids: readonly string[], stored: readonly string[] | undefined): string[] => {
    if (!stored || stored.length === 0) return [...ids];
    const present = new Set(ids);
    const kept = stored.filter(id => present.has(id));
    if (kept.length === 0) return [...ids];
    const seen = new Set(kept);
    return [...kept, ...ids.filter(id => !seen.has(id))];
};

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

export const setChannelOrder = (scope: string, channelIds: string[]): void => {
    const current = normalizeChannelOrder(config.get('ui.channelOrder'));
    const orderedIds = [...new Set(channelIds)];
    const next = { ...current };
    if (orderedIds.length > 0) next[scope] = orderedIds;
    else delete next[scope];
    config.set('ui.channelOrder', next, { lane: 'local' });
};

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
