import { useCallback, useMemo } from 'react';

import { config } from '@chatic/config';
import { useConfigValue } from '@chatic/config/react';

export interface RailOrder {
    clouds: string[];
    places: Record<string, string[]>;
}

const idList = (value: unknown): string[] =>
    Array.isArray(value)
        ? [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0))]
        : [];

export const normalizeRailOrder = (value: unknown): RailOrder => {
    const result: RailOrder = { clouds: [], places: {} };
    if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
    const { clouds, places } = value as { clouds?: unknown; places?: unknown };
    result.clouds = idList(clouds);
    if (places && typeof places === 'object' && !Array.isArray(places)) {
        for (const [cloudId, ids] of Object.entries(places)) {
            const placeIds = idList(ids);
            if (placeIds.length > 0) result.places[cloudId] = placeIds;
        }
    }
    return result;
};

const keepUnshown = (stored: readonly string[], shown: readonly string[]): string[] => {
    const next = idList(shown);
    const placed = new Set(next);
    stored.forEach((id, index) => {
        if (placed.has(id)) return;
        next.splice(next.indexOf(stored[index - 1]) + 1, 0, id);
        placed.add(id);
    });
    return next;
};

const writeRailOrder = (change: (current: RailOrder) => RailOrder): void => {
    config.set('ui.railOrder', change(normalizeRailOrder(config.get('ui.railOrder'))), { lane: 'local' });
};

export const useCloudOrder = () => {
    const raw = useConfigValue<unknown>('ui.railOrder');
    const storedIds = useMemo(() => normalizeRailOrder(raw).clouds, [raw]);

    const set = useCallback((cloudIds: string[]) => {
        writeRailOrder(current => ({ ...current, clouds: keepUnshown(current.clouds, cloudIds) }));
    }, []);

    return { storedIds, set };
};

export const usePlaceOrder = (cloudId: string | null) => {
    const raw = useConfigValue<unknown>('ui.railOrder');
    const storedIds = useMemo(() => (cloudId ? (normalizeRailOrder(raw).places[cloudId] ?? []) : []), [raw, cloudId]);

    const set = useCallback(
        (placeIds: string[]) => {
            if (!cloudId) return;
            writeRailOrder(current => ({
                ...current,
                places: { ...current.places, [cloudId]: keepUnshown(current.places[cloudId] ?? [], placeIds) },
            }));
        },
        [cloudId]
    );

    return { storedIds, set };
};
