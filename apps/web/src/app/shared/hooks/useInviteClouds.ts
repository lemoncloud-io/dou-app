import { useEffect, useState } from 'react';
import { getMobileAppInfo } from '@chatic/app-messages';
import type { InviteCloudView } from '@chatic/app-messages';

export const useInviteClouds = () => {
    const [inviteClouds, setInviteClouds] = useState<InviteCloudView[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const { isOnMobileApp } = getMobileAppInfo();
    const { inviteClouds: localInviteClouds } = useInviteClouds();

    useEffect(() => {
        if (!isOnMobileApp) return;
        setIsLoading(true);
        setInviteClouds(localInviteClouds);
        setIsLoading(false);
    }, [isOnMobileApp]);

    return { inviteClouds, isLoading };
};
