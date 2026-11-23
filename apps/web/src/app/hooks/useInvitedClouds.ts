import { useEffect, useState } from 'react';

import { runtime, type DomainCloud } from '@chatic/runtime';
import { useCloudSessionCatalog } from './useCloudCatalog';
import { isAcceptedBy } from '../utils/invitedCloudAcceptance';

export interface InvitedCloudsResult {
    invitedClouds: DomainCloud[];
    hasInvitedClouds: boolean;
    hasReadInvitedClouds: boolean;
    ownedAlsoInvitedIds: string[];
}

export const useInvitedClouds = (): InvitedCloudsResult => {
    const { cloud } = runtime.data.useRuntimeRepositories();
    const { clouds: ownedClouds } = useCloudSessionCatalog();
    const { delegatorId } = runtime.session.useSessionIdentity();
    const acceptorId = runtime.data.getAcceptorId();
    const isMine = (c: DomainCloud): boolean => isAcceptedBy(c, delegatorId) || isAcceptedBy(c, acceptorId);
    const [cachedInvited, setCachedInvited] = useState<DomainCloud[] | null>(null);

    useEffect(() => {
        return cloud.observeList(result => {
            setCachedInvited((result?.list ?? []).filter(c => c.cloudType === 'invited'));
        });
    }, [cloud]);

    const cached = cachedInvited ?? [];
    const ownedIds = new Set(ownedClouds.map(c => c.id).filter((id): id is string => !!id));
    const invitedClouds = cached.filter(c => (!c.id || !ownedIds.has(c.id)) && isMine(c));
    const ownedAlsoInvitedIds = cached.map(c => c.id).filter((id): id is string => !!id && ownedIds.has(id));

    return {
        invitedClouds,
        hasInvitedClouds: invitedClouds.length > 0,
        hasReadInvitedClouds: cachedInvited !== null,
        ownedAlsoInvitedIds,
    };
};
