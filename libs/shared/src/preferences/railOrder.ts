import { useCallback, useMemo } from 'react';

import { config } from '@chatic/config';
import { useConfigValue } from '@chatic/config/react';

// ---------------------------------------------------------------------------
// `ui.railOrder` — the order the user dragged the two rails into: the cloud
// tiles, and each cloud's place tiles. One record because both are the same
// preference and are cleared together.
//
// Same split as channelOrder: `@chatic/config` validates JSON shape only, the
// product shape is normalized here on the already-decoded value.
// ---------------------------------------------------------------------------

export interface RailOrder {
    clouds: string[];
    /** Place ids per cloud id. A place id is only unique within its cloud. */
    places: Record<string, string[]>;
}

/** Duplicates are collapsed: a hand-edited record must not become duplicate React keys or drag ids. */
const idList = (value: unknown): string[] =>
    Array.isArray(value)
        ? [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0))]
        : [];

/**
 * Keep only recognized values, so a corrupt or tampered record degrades to "no custom order"
 * instead of breaking a rail. A cloud left with no place ids is dropped to keep the record minimal.
 */
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

/**
 * The order to store after a drag. `shown` is the new order of the tiles on screen, and it is the
 * order kept. A stored id that is not on screen is not dropped: a rail can be showing part of its
 * list (a read failed, a source is late), and a drag then must not cost the missing tiles their
 * place. Each one goes back in after the tile it followed, or first if it followed none.
 * "Late" and "gone for good" look the same from here, so the id of a removed cloud stays in the
 * record until logout; reading skips it.
 */
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

/** Read/write the stored cloud order. Ids are applied with `applyChannelOrder`, which is id-generic. */
export const useCloudOrder = () => {
    const raw = useConfigValue<unknown>('ui.railOrder');
    const storedIds = useMemo(() => normalizeRailOrder(raw).clouds, [raw]);

    const set = useCallback((cloudIds: string[]) => {
        writeRailOrder(current => ({ ...current, clouds: keepUnshown(current.clouds, cloudIds) }));
    }, []);

    return { storedIds, set };
};
