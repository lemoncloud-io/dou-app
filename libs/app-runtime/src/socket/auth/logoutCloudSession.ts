import { cloudSession } from '../../session/auth/cloudSession';
import { cloudStore } from '../../session/store/stores';
import { getCommittedCloudId } from '../../session/store';
import { backgroundClouds, selectBackgroundClouds, usableBackgroundEntryOf } from '../backgroundClouds';
import { slotKeyOf } from '../utils/slotKey';

import { notifySocketLogout } from './logoutSession';

/**
 * Returns to relay ("home") while keeping the relay session intact.
 *
 * Leaving the committed cloud is not signing out of it. A cloud the account still belongs to stays
 * a background socket session — the same slot, the same client, now one the user is not looking at
 * — so its socket is NOT told to log out: that would end the session the slot is about to keep. Only
 * a cloud that will not be kept (no longer in the app's list, or past the cap) is notified, the way
 * every leave used to be.
 *
 * Steps:
 *  1. best-effort `auth.logout()` on the committed cloud's slot, only if that cloud is not kept;
 *  2. `cloudSession.clearStores()` clears the committed session and the selection. That drops
 *     `cloud.isActive`, so the cloud slot either becomes a background slot (kept) or is torn down.
 *     The per-cloud token cache is left alone, which is what the kept slot signs from.
 */
export const logoutCloudSession = async (): Promise<void> => {
    // The slot to notify is the committed cloud's — the one whose token the socket authenticated with.
    const committed = getCommittedCloudId();
    if (committed && !isKeptAfterLeaving(committed)) notifySocketLogout(slotKeyOf(committed));
    cloudSession.clearStores();
};

/**
 * Whether `cid` will hold a background slot once nothing is committed — asked the way the slot
 * derivation asks it: selected by the policy, and with a cached entry its socket can keep signing
 * from. Its slot is bound, so the entry's age does not matter; the guard renews it in place.
 */
const isKeptAfterLeaving = (cid: string): boolean =>
    usableBackgroundEntryOf(cid) != null &&
    selectBackgroundClouds({
        joined: backgroundClouds.getJoined(),
        recent: cloudStore.getRecentClouds(),
        committed: null,
    }).includes(cid);
