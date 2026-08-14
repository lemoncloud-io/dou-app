import { useEffect, useRef } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useSessionSelection } from '@chatic/web-core';

import { usePreferenceStore } from '../../../stores/usePreferenceStore';

// One-time flag marking that the legacy `canceledInviteIds` (localStorage) record has been
// folded into the invite cache as dismiss stubs. Kept in localStorage — independent of the cache
// DB — so this runs once per install regardless of environment (web IndexedDB or native SQLite).
//
// Same pattern as `invitedCloudDurability`'s SEED_FLAG_KEY: the flag is set only after a
// successful pass, so a transient failure (cache write error, native bridge unreachable) retries
// next boot; the write is idempotent (`cacheWriteMany` upserts), so re-running is safe.
const MIGRATION_FLAG_KEY = 'chatic-invite-dismiss-migrated';

const hasMigrated = (): boolean => {
    try {
        return typeof window !== 'undefined' && window.localStorage.getItem(MIGRATION_FLAG_KEY) === '1';
    } catch {
        return false;
    }
};

const markMigrated = (): void => {
    try {
        window.localStorage.setItem(MIGRATION_FLAG_KEY, '1');
    } catch {
        // localStorage unavailable — the migration simply re-runs next boot (idempotent writes).
    }
};

/**
 * One-time migration of `canceledInviteIds` (localStorage, ADR-0043 stub era) into the invite
 * cache's `dismissedAt` field (ADR-0052 결정 5). For each legacy id, seeds a stub cache row
 * (`{ id, dismissedAt: now }`, no `state`) so `useCanceledInviteReconcile` — now reading dismissed
 * rows off the cache instead of this store — can drain it exactly as before.
 *
 * Gated on the default (relay) cloud being active: `InviteRepositoryV2`'s local writes are
 * themselves cid-gated (a write while some other cloud is active would seed an orphan row nothing
 * ever reads back), and marking the migration done before a real write landed would silently drop
 * the legacy records. The empty case (no legacy records at all — the common case for any install
 * past the stub era) short-circuits before that gate, since there is nothing to write.
 */
export const useInviteDismissMigration = (): void => {
    const { invite } = useRuntimeRepositories();
    const { selectedCloudId } = useSessionSelection();
    const canceledIds = usePreferenceStore(state => state.canceledInviteIds);
    const clearCanceled = usePreferenceStore(state => state.clearInviteCanceled);
    const startedRef = useRef(false);

    useEffect(() => {
        if (hasMigrated() || startedRef.current) return;

        if (canceledIds.length === 0) {
            markMigrated();
            return;
        }
        if (selectedCloudId !== 'default') return;

        startedRef.current = true;
        void (async () => {
            try {
                await invite.cacheWriteMany(canceledIds.map(id => ({ id, dismissedAt: Date.now() })));
                canceledIds.forEach(id => clearCanceled(id));
                markMigrated();
            } catch {
                // Leave the flag unset and the guard re-armed so the next render/boot retries.
                startedRef.current = false;
            }
        })();
    }, [selectedCloudId, canceledIds, invite, clearCanceled]);
};
