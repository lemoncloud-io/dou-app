import { useEffect } from 'react';
import { getMobileAppInfo } from '@chatic/app-messages';
import { useInviteClouds as useBaseInviteClouds } from '@chatic/data';

export const useInviteClouds = () => {
    const { isOnMobileApp } = getMobileAppInfo();
    const { inviteClouds, isLoading } = useBaseInviteClouds();

    useEffect(() => {
        if (!isOnMobileApp) return;
    }, [isOnMobileApp]);

    return { inviteClouds, isLoading };
};
