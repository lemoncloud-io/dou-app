import { useEffect, useState } from 'react';
import { getMobileAppInfo } from '@chatic/app-messages';
import type { InviteCloudView } from '@chatic/app-messages';
import { inviteCloudRepository } from '../repository/repository';

export const useInviteClouds = () => {
    const [inviteClouds, setInviteClouds] = useState<InviteCloudView[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const { isOnMobileApp } = getMobileAppInfo();

    useEffect(() => {
        if (!isOnMobileApp) return;
        setIsLoading(true);
        inviteCloudRepository()
            .loadAll()
            .then(setInviteClouds)
            .catch(_e => {
                // ignore
            })
            .finally(() => setIsLoading(false));
    }, [isOnMobileApp]);

    return { inviteClouds, isLoading };
};
