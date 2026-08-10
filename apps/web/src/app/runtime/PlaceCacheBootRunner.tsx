import { useEffect } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';

/**
 * TEMP: clears the place cache once per app boot, before `BackgroundSyncRunner`'s rising-edge
 * `refreshList()` repopulates it.
 *
 * Place is a full-snapshot domain with no delta-sync watermark: `PlaceRepositoryV2.refreshList`
 * reconciles (prunes rows the server no longer lists) only against whichever cid partition is
 * active when it runs, so a cloud left unvisited never gets that reconciliation and its cached
 * place rows can go stale indefinitely with no cleanup path.
 *
 * This only clears whichever partition is active at boot (place is cached per {cid, uid}; there is
 * no cross-partition clear), so it does not reach OTHER clouds' place rows — a stopgap for the
 * active-partition case, not a fix for stale data in clouds this boot never visits.
 *
 * Renders nothing; mounted once under AppRuntime, before BackgroundSyncRunner so the clear settles
 * ahead of the boot-time refetch (which additionally waits on socket verification, a real
 * round-trip — far slower than this local clear).
 */
export const PlaceCacheBootRunner = (): null => {
    const { place } = useRuntimeRepositories();

    useEffect(() => {
        void place.cacheClear().catch(() => undefined);
        // Once per mount (app boot) — not re-run on session/context changes.
    }, []);

    return null;
};
