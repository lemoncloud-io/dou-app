import { cloudSession } from '../../session/auth/cloudSession';
import { getCommittedCloudId } from '../../session/store';
import { backgroundClouds, hasLiveJoinedSession } from '../backgroundClouds';
import { slotKeyOf } from '../utils/slotKey';

import { notifySocketLogout } from './logoutSession';

/**
 * Returns to relay ("home") while keeping the relay session intact.
 *
 * Leaving the committed cloud is not signing out of it. A cloud the account still belongs to stays
 * a background socket session — the same slot, the same client, now one the user is not looking at
 * — so its socket is NOT told to log out: that would end the session the slot is about to keep.
 *
 * Who says `auth.logout` when the cloud is NOT kept depends on why. A cloud still in the app's list
 * with a live session, but past the cap, is signed off by `SocketBinder` as it tears the slot down —
 * the same path every other cap-dropped slot takes. Everything else (a cloud no longer in the list,
 * one whose cached tokens are gone) is signed off here, the way every leave used to be. The two
 * conditions are exact opposites, so a cloud is notified once.
 *
 * A cloud a send is still in flight to (`backgroundClouds.hold`) is not signed off here either: its
 * slot stays bound for the send, and a logout on that socket would unauthenticate it under the ack.
 * When the hold ends the binder tears the slot down, and closing the socket is what ends it then.
 *
 * Steps:
 *  1. best-effort `auth.logout()` on the committed cloud's slot, in the case above;
 *  2. `cloudSession.clearStores()` clears the committed session and the selection. That drops
 *     `cloud.isActive`, so the cloud slot either becomes a background slot (kept) or is torn down.
 *     The per-cloud token cache is left alone, which is what the kept slot signs from.
 */
export const logoutCloudSession = async (): Promise<void> => {
    // The slot to notify is the committed cloud's — the one whose token the socket authenticated with.
    const committed = getCommittedCloudId();
    const held = committed != null && backgroundClouds.getHeld().includes(committed);
    if (committed && !held && !hasLiveJoinedSession(committed)) notifySocketLogout(slotKeyOf(committed));
    cloudSession.clearStores();
};
