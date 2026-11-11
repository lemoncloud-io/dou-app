import { useEffect, useState } from 'react';

import { runtime } from '@chatic/app-runtime';
import { useCloudSessionCatalog } from './useCloudCatalog';
import { isAcceptedBy } from '../utils/invitedCloudAcceptance';
import type { DomainCloud } from '@chatic/data';

export interface InvitedCloudsResult {
    invitedClouds: DomainCloud[];
    hasInvitedClouds: boolean;
    /**
     * Owned clouds this device has also cached as invited — the rows hidden from `invitedClouds` for
     * being owned. Their token may have been issued to the device's guest, so they are handed to the
     * owned-cloud reclaim. Not filtered by acceptor: a row another guest accepted costs the reclaim a
     * storage read when this session holds no token for it, and nothing more.
     */
    ownedAlsoInvitedIds: string[];
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
 *
 * Attribution: inside a shell the cache is shared by every guest the device has had, and a browser
 * tab's rows survive a logout, so a row recorded as accepted by someone other than this session —
 * under neither its guest `delegatorId` nor its relay uid — is left out (non-destructive too).
 * Everything downstream — the cloud sheet, the background sockets, unread counts — reads this list,
 * and a cloud left in it would be delegated into by a guest the server never granted it to (see
 * `utils/invitedCloudAcceptance`).
 */
export const useInvitedClouds = (): InvitedCloudsResult => {
    const { cloud } = runtime.data.useRuntimeRepositories();
    const { clouds: ownedClouds } = useCloudSessionCatalog();
    // A row is this session's when either of its two ids is recorded on it. The invite accept records the
    // device guest (`delegatorId`), and a rebuilt row records the relay session's uid (`getAcceptorId`).
    // For a guest the two are the same id, but a signed-in account keeps the guest's `delegatorId` while
    // its relay uid is the account's own, so matching the relay uid alone would miss every row the accept
    // wrote while the account was signed in.
    const { delegatorId } = runtime.session.useSessionIdentity();
    const acceptorId = runtime.data.getAcceptorId();
    const isMine = (c: DomainCloud): boolean => isAcceptedBy(c, delegatorId) || isAcceptedBy(c, acceptorId);
    const [cachedInvited, setCachedInvited] = useState<DomainCloud[]>([]);

    useEffect(() => {
        return cloud.observeList(result => {
            setCachedInvited((result?.list ?? []).filter(c => c.cloudType === 'invited'));
        });
    }, [cloud]);

    // Drop invited rows whose id is present in the owned catalog (now owned by the signed-in account).
    const ownedIds = new Set(ownedClouds.map(c => c.id).filter((id): id is string => !!id));
    const invitedClouds = cachedInvited.filter(c => (!c.id || !ownedIds.has(c.id)) && isMine(c));
    const ownedAlsoInvitedIds = cachedInvited.map(c => c.id).filter((id): id is string => !!id && ownedIds.has(id));

    return { invitedClouds, hasInvitedClouds: invitedClouds.length > 0, ownedAlsoInvitedIds };
};
