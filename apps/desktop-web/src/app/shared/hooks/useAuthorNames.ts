import { useEffect, useMemo, useState } from 'react';

import { useRepositories } from '@chatic/app-runtime';

import { displayName } from '../utils';

/**
 * Session-scoped, in-memory memo of resolved author names (id → name). It is NOT
 * a parallel data store — it only mirrors names already resolved from the `user`
 * cache so a re-render (e.g. switching channels and back) can paint the name
 * synchronously on the first frame, instead of waiting a tick for the async
 * `subscribeItem` emission and flashing a skeleton. It is never persisted.
 */
const nameMemo = new Map<string, string>();

const seedFromMemo = (ids: string[]): Map<string, string> => {
    const map = new Map<string, string>();
    for (const id of ids) {
        const name = nameMemo.get(id);
        if (name) map.set(id, name);
    }
    return map;
};

/**
 * Resolve message author names straight from the `user` cache, keyed by owner id.
 *
 * The `user` cache is the single source for author names; this hook is decoupled
 * from the channel-roster fetch so a previously-seen author paints with their
 * real name on the first frame — no "Unknown"/skeleton flicker while the roster
 * reloads. The session memo is read synchronously during render (so switching
 * channels and back is instant), and `subscribeItem` streams the persisted record
 * plus live updates into the memo, bumping a tick to surface a newly-resolved name.
 * Only an author the cache has never held stays unresolved (the roster fetch fills
 * the cache, which this hook then surfaces). A bare id (no name/nick) counts as
 * unresolved so the raw id never flashes as a name.
 */
export const useAuthorNames = (ownerIds: readonly (string | undefined)[]): ReadonlyMap<string, string> => {
    const { user: userRepository } = useRepositories();

    // Stable, de-duped key so subscriptions only reset when the id set changes.
    const idsKey = useMemo(
        () => [...new Set(ownerIds.filter((id): id is string => !!id))].sort().join(','),
        [ownerIds]
    );
    const ids = useMemo(() => (idsKey ? idsKey.split(',') : []), [idsKey]);

    // Bumped whenever a subscription writes a new name into the memo, so the
    // synchronous seed below re-reads it.
    const [tick, setTick] = useState(0);

    useEffect(() => {
        if (ids.length === 0) return;
        const unsubs = ids.map(id =>
            userRepository.subscribeItem(id, user => {
                if (!user) return;
                const name = displayName(user);
                // displayName falls back to the raw id — treat that as unresolved.
                if (!name || name === id || nameMemo.get(id) === name) return;
                nameMemo.set(id, name);
                setTick(t => t + 1);
            })
        );
        return () => unsubs.forEach(unsub => unsub());
    }, [ids, userRepository]);

    // Synchronous per-render read of the memo: a warm author paints on frame one.
    // `tick` is a dep so a live update (written to the memo) re-reads it.
    return useMemo(() => seedFromMemo(ids), [ids, tick]);
};
