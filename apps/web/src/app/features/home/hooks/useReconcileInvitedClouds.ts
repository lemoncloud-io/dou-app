import { useEffect } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useCloudSessionCatalog } from '@chatic/web-core';

import { useInvitedClouds } from '../../../hooks/useInvitedClouds';

/**
 * Reconciles the invited-cloud cache against the owned relay catalog.
 *
 * A guest can accept a cloud invite (cached as cloudType:'invited') and later sign in with the
 * real account that owns that cloud. The cloud then appears in the owned relay catalog, so the
 * stale 'invited' cache row misclassifies it — it would show under the invite tab and be hidden
 * from "my clouds". The catalog is authoritative for ownership, so any invited cache row whose id
 * is present in the catalog is purged; the cloud then surfaces from the catalog alone.
 *
 * Matching is by cloud id. This self-heals on any catalog refetch (e.g. right after login), so it
 * does not depend on a specific login/upgrade trigger.
 */
export const useReconcileInvitedClouds = (): void => {
    const { cloud } = useRuntimeRepositories();
    const { clouds: ownedClouds } = useCloudSessionCatalog();
    const { invitedClouds } = useInvitedClouds();

    useEffect(() => {
        const ownedIds = new Set(ownedClouds.map(c => c.id).filter((id): id is string => !!id));
        const stale = invitedClouds.filter(c => c.id && ownedIds.has(c.id));
        for (const c of stale) {
            // Best-effort local cleanup — a failure must not surface to the UI.
            void cloud.cacheDelete(c.id as string).catch(() => {
                /* best-effort reconcile */
            });
        }
    }, [cloud, ownedClouds, invitedClouds]);
};
