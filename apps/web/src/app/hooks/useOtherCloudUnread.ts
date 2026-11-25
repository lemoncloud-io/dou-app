import { useMemo } from 'react';

import { RELAY_CLOUD_ID } from '@chatic/runtime-react';

import { useCloudSessionCatalog } from './useCloudCatalog';
import { useOtherCloudUnreadContext } from './otherCloudUnreadContext';
import { useInvitedClouds } from './useInvitedClouds';
import { useJoinedCloudIds } from './useJoinedCloudIds';

export interface OtherCloudUnread {
    byCloud: Record<string, number>;
    total: number;
}

export const useOtherCloudIds = (activeCloudId: string): readonly string[] => {
    const { clouds: ownedClouds } = useCloudSessionCatalog();
    const { invitedClouds } = useInvitedClouds();
    const joinedCloudIds = useJoinedCloudIds(ownedClouds, invitedClouds);
    const key = [RELAY_CLOUD_ID, ...joinedCloudIds]
        .filter(id => id !== activeCloudId)
        .sort()
        .join('\n');
    return useMemo(() => (key ? key.split('\n') : []), [key]);
};

export const useOtherCloudUnread = (): OtherCloudUnread => useOtherCloudUnreadContext();
