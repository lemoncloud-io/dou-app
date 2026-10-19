import { useEffect } from 'react';

import { isNative, webClient } from '@chatic/bridges';
import { runtime } from '@chatic/app-runtime';
import { pushCloudIdOf, RELAY_CLOUD_ID } from '@chatic/data';

import { useOwnedCloudIds } from './useCloudCatalog';

/**
 * In-flight recoveries, keyed by cloud. A chatty channel bursts pushes for one
 * cloud; without this each of them issues its own `delegate-cloud` call against
 * the relay. Module scope so the burst is deduped across renders.
 */
const inflight = new Set<string>();

/**
 * Push-triggered invited-cloud recovery — the desktop half of the push safety net.
 *
 * An invited cloud's only durable record is its local cache row, so a reinstall
 * or cache clear drops clouds the relay catalog cannot refill. A push is the one
 * signal that still names the missing cloud (`data.cid`, flattened top-level by
 * the shell), and `recoverInvitedCloudIfMissing` re-derives its endpoints from a
 * fresh delegation token (no-op when already cached, best-effort on failure).
 *
 * Runs beside presentation, never inside it: the presenter drops silent pushes,
 * muted channels, own messages and DND windows, but a dropped cloud still needs
 * its endpoints back. Owned-catalog clouds are skipped — the catalog is their
 * record, and an invited row for one would mislabel it. No-op in a plain browser.
 */
export const usePushInvitedCloudRecovery = (): void => {
    const { cloud } = runtime.data.useRuntimeRepositories();
    const owned = useOwnedCloudIds();

    useEffect(() => {
        if (!isNative()) return;
        return webClient.onEvent('OnReceiveNotification', message => {
            const data = (message?.data as { notification?: { data?: Record<string, string> } })?.notification?.data;
            const cid = pushCloudIdOf(data?.cid);
            // The relay (a relay push's `'#'`) is never an invited cloud — there is nothing to recover.
            if (!cid || cid === RELAY_CLOUD_ID || owned.has(cid) || inflight.has(cid)) return;
            inflight.add(cid);
            void runtime.data
                .recoverInvitedCloudIfMissing(cloud, cid)
                .catch(() => undefined)
                .finally(() => {
                    inflight.delete(cid);
                });
        });
    }, [cloud, owned]);
};
