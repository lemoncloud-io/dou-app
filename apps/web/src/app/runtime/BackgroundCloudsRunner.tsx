import { useEffect, useState } from 'react';

import { runtime } from '@chatic/runtime';

import { useCloudSessionCatalog } from '../hooks/useCloudCatalog';
import { useInvitedClouds } from '../hooks/useInvitedClouds';
import { useJoinedCloudIds } from '../hooks/useJoinedCloudIds';

/**
 * How long the runner waits for the invited-cloud cache once the catalog has answered. The cache is a
 * local read that answers in well under a second; one that failed its read and its single retry stays
 * silent until the next write, and without a limit it would hold back the owned clouds too.
 */
export const INVITED_CACHE_WAIT_MS = 5_000;

/** True once `armed` has held for `ms` — a wait that ends on its own. Re-arming starts it over. */
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

/**
 * Hands the runtime every cloud this account belongs to, so each keeps a socket session while the
 * user is in another one — or at home. Which of them actually get a socket (the cap, the order) is
 * the runtime's decision; this only supplies membership, which only the app can see.
 *
 * Nothing is handed over until the membership is known, because before that the joined list is a
 * stand-in — and on a phone whose shell runs the session it would reach a runtime that outlived the
 * page: a reloaded page announcing a partial or empty list there tears down background sockets that
 * were fine. Known means both sources have answered:
 *
 * - **The catalog.** A failure counts as an answer only once the relay socket is verified. A reload
 *   with a stale relay credential fails its first reads before the handshake; the catalog is read
 *   again once the relay verifies, so a failure before that says nothing about the owned clouds. A
 *   failure with the relay verified does count, so the invited clouds are not held back by an owned
 *   list that may not come.
 * - **The invited-cloud cache**, or `INVITED_CACHE_WAIT_MS` after the catalog answered, whichever is
 *   first — the cache then counts as empty.
 *
 * The owned ones go over a second time on their own: an owned cloud this device holds as an invitee
 * (its owner accepted their own invite link here, or a guest accepted and later signed in to the
 * owning account) is re-issued as the owner. The owned clouds also cached as invited go with them —
 * the only trace left of a guest's token once it has been renewed. Sharing this runner keeps every
 * list read from the one catalog the switcher shows.
 */
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
