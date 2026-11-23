import { cloudSession } from '../session/cloudSession';
import { getCommittedCloudId } from '@chatic/session';
import { backgroundClouds, hasLiveJoinedSession, slotKeyOf } from '@chatic/transport';

import { notifySocketLogout } from './logoutSession';

export const logoutCloudSession = async (): Promise<void> => {
    const committed = getCommittedCloudId();
    const held = committed != null && backgroundClouds.getHeld().includes(committed);
    if (committed && !held && !hasLiveJoinedSession(committed)) notifySocketLogout(slotKeyOf(committed));
    cloudSession.clearStores();
};
