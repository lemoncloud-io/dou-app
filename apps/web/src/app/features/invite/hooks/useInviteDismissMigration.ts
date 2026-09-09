import { useEffect, useRef } from 'react';

import { runtime } from '@chatic/app-runtime';
import { parseInviteIds } from '../../../stores/preferenceParsers';

/** The legacy, pre-cache-stub storage key (ADR-0043 era) — never became a `@chatic/config` key. */
const LEGACY_KEY = 'dou.relayInvite.locallyCanceled.v1';

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

const readLegacyCanceledIds = (): string[] => {
    try {
        if (typeof window === 'undefined') return [];
        const raw = window.localStorage.getItem(LEGACY_KEY);
        return raw === null ? [] : parseInviteIds(raw);
    } catch {
        return [];
    }
};

const clearLegacyCanceledIds = (): void => {
    try {
        window.localStorage.removeItem(LEGACY_KEY);
    } catch {
        // Best-effort — a leftover legacy key with nothing new writable into it is harmless.
    }
};

/**
 * One-time migration of `canceledInviteIds` (localStorage, ADR-0043 stub era) into the invite
 * cache's `dismissedAt` field (ADR-0052 결정 5). For each legacy id, seeds a stub cache row
 * (`{ id, dismissedAt: now }`, no `state`) so `useCanceledInviteReconcile` — reading dismissed rows
 * off the cache — can drain it exactly as before.
 *
 * This data never became a `@chatic/config` key (unlike the other former `usePreferenceStore`
 * fields) — it is a one-way, shrinking-to-empty migration source, not a setting with a default and
 * an override. Read directly off its legacy key rather than through the registry.
 *
 * Gated on the default (relay) cloud being active: `InviteRepositoryV2`'s local writes are
 * themselves cid-gated (a write while some other cloud is active would seed an orphan row nothing
 * ever reads back), and marking the migration done before a real write landed would silently drop
 * the legacy records. The empty case (no legacy records at all — the common case for any install
 * past the stub era) short-circuits before that gate, since there is nothing to write.
 */
export const useInviteDismissMigration = (): void => {
    const { invite } = runtime.data.useRuntimeRepositories();
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const startedRef = useRef(false);

    useEffect(() => {
        if (hasMigrated() || startedRef.current) return;

        const canceledIds = readLegacyCanceledIds();
        if (canceledIds.length === 0) {
            markMigrated();
            return;
        }
        if (selectedCloudId !== 'default') return;

        startedRef.current = true;
        void (async () => {
            try {
                await invite.cacheWriteMany(canceledIds.map(id => ({ id, dismissedAt: Date.now() })));
                clearLegacyCanceledIds();
                markMigrated();
            } catch {
                // Leave the flag unset and the guard re-armed so the next render/boot retries.
                startedRef.current = false;
            }
        })();
    }, [selectedCloudId, invite]);
};
