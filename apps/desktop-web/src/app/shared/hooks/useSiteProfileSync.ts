import { useEffect } from 'react';

import { logger } from '@chatic/bridges';
import { useWebSocketV2Store } from '@chatic/socket';
import { useRuntimeRepositories } from '@chatic/app-runtime';

import { useSelectedPlaceStore } from '../stores/useSelectedPlaceStore';
import { useSiteProfileCursorStore } from '../stores/useSiteProfileCursorStore';

/**
 * Pulls Place-Profile deltas for the current place and advances the per-{cid,sid}
 * cursor. Fires on place switch, socket verified (app start), reconnect, and
 * window focus — the catch-up paths, since the backend does not emit
 * profile.invalidate yet (ADR 0007); the focus pull covers changes made by
 * others while the window was in the background. The repository applies the
 * delta to the cache idempotently; this hook just stores the returned
 * `syncedAt`. Fail-soft: errors keep the Global display and leave the cursor
 * untouched.
 */
export const useSiteProfileSync = (): void => {
    const { profile: profileRepository } = useRuntimeRepositories();
    const sid = useSelectedPlaceStore(s => s.selectedPlaceId);
    const cid = useWebSocketV2Store(s => s.cloudId) ?? 'default';
    const isVerified = useWebSocketV2Store(s => s.isVerified);

    useEffect(() => {
        if (!isVerified || !sid) return;
        // `cancelled` (not a shared ref) so a place switch mid-sync still re-runs
        // for the new place and only the live invocation advances its cursor.
        let cancelled = false;
        const runSync = () => {
            const since = useSiteProfileCursorStore.getState().getCursor(cid, sid);
            profileRepository
                .syncProfiles(since)
                .then(result => {
                    if (!cancelled && typeof result?.syncedAt === 'number') {
                        useSiteProfileCursorStore.getState().setCursor(cid, sid, result.syncedAt);
                    }
                })
                .catch(error => logger.error('PROFILE', '[useSiteProfileSync] sync failed → keep Global', { error }));
        };
        runSync();
        const onFocus = () => runSync();
        window.addEventListener('focus', onFocus);
        return () => {
            cancelled = true;
            window.removeEventListener('focus', onFocus);
        };
    }, [profileRepository, cid, sid, isVerified]);
};
