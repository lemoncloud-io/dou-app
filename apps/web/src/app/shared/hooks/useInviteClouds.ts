import { useEffect, useState } from 'react';
import { useRepositories } from '@chatic/app-runtime';
import type { DomainInviteCloud, DomainListResult } from '@chatic/data';
import { isNative } from '@chatic/bridges';

export const useInviteClouds = () => {
    const [inviteClouds, setInviteClouds] = useState<DomainListResult<DomainInviteCloud>>();
    const [isLoading, setIsLoading] = useState(false);

    const isOnMobileApp = isNative();
    const { inviteCloud: inviteCloudRepository } = useRepositories();

    useEffect(() => {
        if (!isOnMobileApp) return;

        setIsLoading(true);

        const unsubscribe = inviteCloudRepository.subscribeList(result => {
            if (result === null) return;

            setInviteClouds(result);
            setIsLoading(false);
        });

        return () => {
            unsubscribe();
        };
    }, [isOnMobileApp, inviteCloudRepository]);

    return {
        inviteClouds,
        isLoading: isLoading || !inviteClouds,
        isEmpty: inviteClouds && inviteClouds.list.length === 0,
    };
};
