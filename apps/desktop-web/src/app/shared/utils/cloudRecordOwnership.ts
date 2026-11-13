import type { runtime } from '@chatic/app-runtime';

import { deviceStore } from '../../storage';
import { useJoinedCloudsStore } from '../stores/useJoinedCloudsStore';

/**
 * Which account the device-wide cloud records were last reconciled for. Removed on sign-out
 * (`useAccountResetOnLogout`), so a value that is still here when a different uid shows up means the
 * session was replaced in place — a guest linking to an account — rather than someone else signing in.
 */
export const CLOUD_RECORD_OWNER_KEY = 'chatic-cloud-records-owner';

const replaceOwner = (acceptedBy: readonly string[] | undefined, from: string, to: string): string[] | undefined => {
    if (!acceptedBy?.includes(from)) return undefined;
    return [...acceptedBy.filter(id => id !== from && id !== to), to];
};

/**
 * Keeps the invited-cloud records (cache rows' `acceptedBy`, joined-clouds entries' `ownerUid`)
 * attributed as the signed-in account changes. Run once per session start or sign-in, for the relay uid
 * of the session (never from a render). Idempotent: a record that already has an owner is never
 * re-stamped by the adoption.
 *
 * - **Adoption.** A record written before attribution existed has no owner. The first account to be
 *   signed in takes every such record; afterwards they carry an owner, so a later account does not
 *   see them. (On a device several accounts already used, the first one adopts what leaked and can
 *   remove it with "remove cloud".)
 * - **Link.** When the uid changed without a sign-out in between, the records held by the previous
 *   uid move to the new one. A guest that signs in to an existing account comes out with that account's
 *   uid, not its own, and the invited clouds it joined would otherwise be lost to it.
 */
export const reconcileCloudRecordOwners = async (
    cloud: runtime.data.PageRepositories['cloud'],
    accountId: string
): Promise<void> => {
    const previous = deviceStore.get(CLOUD_RECORD_OWNER_KEY);
    const moveFrom = previous && previous !== accountId ? previous : null;

    const rows = (await cloud.cacheReadList())?.list ?? [];
    for (const row of rows) {
        if (!row.id || row.cloudType !== 'invited') continue;
        const moved = moveFrom ? replaceOwner(row.acceptedBy, moveFrom, accountId) : undefined;
        const acceptedBy = moved ?? (row.acceptedBy?.length ? undefined : [accountId]);
        if (acceptedBy) await cloud.cacheWrite({ id: row.id, cid: row.cid ?? row.id, acceptedBy });
    }
    useJoinedCloudsStore.getState().reconcileOwners(accountId, moveFrom);

    deviceStore.set(CLOUD_RECORD_OWNER_KEY, accountId);
};
