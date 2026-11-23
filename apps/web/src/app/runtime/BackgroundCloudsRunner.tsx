import { useEffect, useState } from 'react';

import { runtime } from '@chatic/runtime';

import { useCloudSessionCatalog } from '../hooks/useCloudCatalog';
import { useInvitedClouds } from '../hooks/useInvitedClouds';
import { useJoinedCloudIds } from '../hooks/useJoinedCloudIds';

export const INVITED_CACHE_WAIT_MS = 5_000;

const useWaitedFor = (armed: boolean, ms: number): boolean => {
    const [expired, setExpired] = useState(false);
    useEffect(() => {
        setExpired(false);
        if (!armed) return undefined;
        const timer = setTimeout(() => setExpired(true), ms);
        return () => clearTimeout(timer);
    }, [armed, ms]);
    return armed && expired;
};

export const BackgroundCloudsRunner = () => {
    const { clouds: ownedClouds, hasCloudCatalog, isCloudsError } = useCloudSessionCatalog();
    const { invitedClouds, hasReadInvitedClouds, ownedAlsoInvitedIds } = useInvitedClouds();
    const isRelayVerified = runtime.connection.useSlotVerified(runtime.connection.RELAY_SLOT);
    const joined = useJoinedCloudIds(ownedClouds, invitedClouds);

    const catalogAnswered = hasCloudCatalog || (isCloudsError && isRelayVerified);
    const invitedWaitOver = useWaitedFor(catalogAnswered && !hasReadInvitedClouds, INVITED_CACHE_WAIT_MS);
    const knowsMembership = catalogAnswered && (hasReadInvitedClouds || invitedWaitOver);

    runtime.connection.useBackgroundClouds(knowsMembership ? joined : null);
    runtime.connection.useReclaimOwnedClouds(useJoinedCloudIds(ownedClouds, []), ownedAlsoInvitedIds);
    return null;
};
