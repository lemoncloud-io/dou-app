import { useEffect, useState } from 'react';
import { getMobileAppInfo } from '@chatic/app-messages';
import type { InviteCloudView } from '@chatic/app-messages';
import { useInviteRepository } from '../data';
import { useWebSocketV2Store } from '@chatic/socket';

export const useInviteClouds = () => {
    const [inviteClouds, setInviteClouds] = useState<InviteCloudView[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const { isOnMobileApp } = getMobileAppInfo();
    const cloudId = useWebSocketV2Store().cloudId;
    const inviteRepository = useInviteRepository(cloudId);

    useEffect(() => {
        if (!isOnMobileApp) return;
        setIsLoading(true);
        inviteRepository
            .getInvites()
            .then(setInviteClouds)
            .catch(_e => {
                // ignore
            })
            .finally(() => setIsLoading(false));
    }, [isOnMobileApp]);

    return { inviteClouds, isLoading };
};
