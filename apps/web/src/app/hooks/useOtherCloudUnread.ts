import { useMemo } from 'react';

import { RELAY_CLOUD_ID } from '@chatic/data';

import { useCloudSessionCatalog } from './useCloudCatalog';
import { useOtherCloudUnreadContext } from './otherCloudUnreadContext';
import { useInvitedClouds } from './useInvitedClouds';
import { useJoinedCloudIds } from './useJoinedCloudIds';

export interface OtherCloudUnread {
    /** Unread per inactive cloud id; a cloud with nothing unread, or nothing cached, is absent. */
    byCloud: Record<string, number>;
    /** Sum across every inactive cloud. */
    total: number;
}

/**
 * The clouds whose unread is counted apart from the active one: owned + invited + relay, minus the
 * cloud on screen — which is observed live by `ActiveCloudDataProvider`, and would otherwise be
 * counted twice. Sorted, so the same set is the same list.
 */
export const useOtherCloudIds = (activeCloudId: string): readonly string[] => {
    const { clouds: ownedClouds } = useCloudSessionCatalog();
    const { invitedClouds } = useInvitedClouds();
    const joinedCloudIds = useJoinedCloudIds(ownedClouds, invitedClouds);
    const key = [RELAY_CLOUD_ID, ...joinedCloudIds]
        .filter(id => id !== activeCloudId)
        .sort()
        .join('\n');
    // Keyed on the content: the catalog queries hand back fresh arrays on most renders.
    return useMemo(() => (key ? key.split('\n') : []), [key]);
};

/**
 * Unread for the inactive clouds, from the ONE shared observation (`OtherCloudUnreadProvider`).
 *
 * `HomePage` (switcher dot + the sheet's per-cloud rows) and `UnreadBadgeRunner` (app-icon total)
 * both read it, so the sheet and the badge cannot disagree about another cloud.
 */
export const useOtherCloudUnread = (): OtherCloudUnread => useOtherCloudUnreadContext();
