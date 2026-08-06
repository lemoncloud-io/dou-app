import { useEffect, useState } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useCloudSessionCatalog } from '@chatic/web-core';
import type { DomainCloud } from '@chatic/data';

export interface InvitedCloudsResult {
    invitedClouds: DomainCloud[];
    hasInvitedClouds: boolean;
}

/**
 * Observes invited clouds from the local cloud cache (cloudType === 'invited').
 *
 * Invited clouds are NOT part of the relay catalog (useCloudSessionCatalog); they are written to
 * the cloud cache by the invite-accept flow, so they are observed separately here. This lets guest
 * (temp_account) users who have accepted a cloud invite be distinguished from plain guests and be
 * offered cloud switching.
 *
 * Ownership reconciliation: a guest can accept a cloud invite and later sign in with the real
 * account that OWNS that cloud — it then appears in the owned relay catalog. Such clouds are hidden
 * from the invited list (non-destructive: the cache row is kept) so they surface only as owned and
 * are never shown twice.
 */
export const useInvitedClouds = (): InvitedCloudsResult => {
    const { cloud } = useRuntimeRepositories();
    const { clouds: ownedClouds } = useCloudSessionCatalog();
    const [cachedInvited, setCachedInvited] = useState<DomainCloud[]>([]);

    useEffect(() => {
        return cloud.observeList(result => {
            setCachedInvited((result?.list ?? []).filter(c => c.cloudType === 'invited'));
        });
    }, [cloud]);

    // Drop invited rows whose id is present in the owned catalog (now owned by the signed-in account).
    const ownedIds = new Set(ownedClouds.map(c => c.id).filter((id): id is string => !!id));
    const invitedClouds = cachedInvited.filter(c => !c.id || !ownedIds.has(c.id));

    return { invitedClouds, hasInvitedClouds: invitedClouds.length > 0 };
};
