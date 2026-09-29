import { useEffect, useMemo, useRef, useState } from 'react';

import { runtime } from '@chatic/app-runtime';

import { displayName } from '../utils';

/** A person as the `user` cache of the active cloud holds them — their cloud profile. */
export interface CloudProfile {
    name?: string;
    thumbnail?: string;
}

/**
 * Session-scoped, in-memory memo of resolved cloud profiles (id → name/photo). It is NOT
 * a parallel data store — it only mirrors what the `user` cache already resolved so a
 * re-render (e.g. switching channels and back) can paint on the first frame, instead of
 * waiting a tick for the async `observeItem` emission and flashing a skeleton. It is never
 * persisted.
 */
const profileMemo = new Map<string, CloudProfile>();

const seedFromMemo = (ids: string[]): Map<string, CloudProfile> => {
    const map = new Map<string, CloudProfile>();
    for (const id of ids) {
        const profile = profileMemo.get(id);
        if (profile) map.set(id, profile);
    }
    return map;
};

/**
 * Resolve people's cloud profiles (name and photo) straight from the `user` cache, keyed by id.
 *
 * The `user` cache is the single source; this hook is decoupled from any roster fetch so a
 * previously-seen person paints with their real name on the first frame — no "Unknown"/skeleton
 * flicker while a roster reloads. The session memo is read synchronously during render, and
 * `observeItem` streams the persisted record plus live updates into the memo, bumping a tick to
 * surface a newly-resolved profile. Only a person the cache has never held stays unresolved (a
 * roster fetch fills the cache, which this hook then surfaces). A bare id (no name/nick) leaves the
 * name unresolved so the raw id never flashes as a name.
 */
export const useCloudProfiles = (ids: readonly (string | undefined)[]): ReadonlyMap<string, CloudProfile> => {
    const { user: userRepository } = runtime.data.useRuntimeRepositories();

    // Stable, de-duped key so subscriptions only reset when the id set changes.
    const idsKey = useMemo(() => [...new Set(ids.filter((id): id is string => !!id))].sort().join(','), [ids]);
    const keyedIds = useMemo(() => (idsKey ? idsKey.split(',') : []), [idsKey]);

    // Bumped whenever a subscription writes a new profile into the memo, so the
    // synchronous seed below re-reads it.
    const [tick, setTick] = useState(0);

    // Synchronous per-render read of the memo: a warm person paints on frame one.
    // `tick` is a dep so a live update (written to the memo) re-reads it.
    const resolved = useMemo(() => seedFromMemo(keyedIds), [keyedIds, tick]);
    const resolvedRef = useRef(resolved);
    resolvedRef.current = resolved;

    useEffect(() => {
        if (keyedIds.length === 0) return;
        const unsubs = keyedIds.map(id =>
            userRepository.observeItem(id, user => {
                if (!user) return;
                const resolved = displayName(user);
                // displayName falls back to the raw id — treat that as unresolved.
                const name = resolved && resolved !== id ? resolved : undefined;
                const thumbnail = user.thumbnail || undefined;
                if (!name && !thumbnail) return;
                profileMemo.set(id, { name, thumbnail });
                // Compare with what THIS caller returned, not with the memo: another caller
                // may have written the same profile first, and skipping on that left this
                // one showing the raw id for good.
                const shown = resolvedRef.current.get(id);
                if (shown?.name !== name || shown?.thumbnail !== thumbnail) setTick(t => t + 1);
            })
        );
        return () => unsubs.forEach(unsub => unsub());
    }, [keyedIds, userRepository]);

    return resolved;
};

/** Message author names from the `user` cache, keyed by owner id — see {@link useCloudProfiles}. */
export const useAuthorNames = (ownerIds: readonly (string | undefined)[]): ReadonlyMap<string, string> => {
    const profiles = useCloudProfiles(ownerIds);
    return useMemo(() => {
        const names = new Map<string, string>();
        for (const [id, { name }] of profiles) if (name) names.set(id, name);
        return names;
    }, [profiles]);
};
