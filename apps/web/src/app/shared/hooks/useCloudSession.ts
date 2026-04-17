import { useEffect, useRef } from 'react';
import { useIssueCloudToken } from '@chatic/auth';

import { useClouds } from '@chatic/users';
import { cloudCore, useWebCoreStore } from '@chatic/web-core';
import type { UserProfile$ } from '@lemoncloud/chatic-backend-api';

export const getCloudSession = () => {
    const wss = cloudCore.getWss();
    const identityToken = cloudCore.getIdentityToken();
    const backend = cloudCore.getBackend();
    if (!wss || !identityToken || !backend) return null;
    return { wss, identityToken, backend };
};

export const clearCloudSession = (): void => {
    cloudCore.clearSession();
};

export const useCloudSession = () => {
    const { mutateAsync: issueCloudToken, isPending } = useIssueCloudToken();
    const { isAuthenticated, setProfile } = useWebCoreStore();
    const { data, isError: isFetchError, isFetching, refetch } = useClouds({ limit: -1, enabled: isAuthenticated });

    const clouds = data?.list ?? [];
    const isCloudsError = !isFetching && isFetchError;

    const selectCloud = async (cloudId: string) => {
        try {
            const { cloudDelegationToken, userToken } = await issueCloudToken(cloudId);

            cloudCore.saveDelegationToken(cloudDelegationToken);
            cloudCore.saveCloudToken(userToken);
            cloudCore.saveSelectedCloudId(cloudId);

            const currentProfile = useWebCoreStore.getState().profile;
            const { Token: _Token, ...cloudProfile } = userToken;
            setProfile({ ...currentProfile, ...cloudProfile } as unknown as UserProfile$);
        } catch (e) {
            console.error('[useCloudSession] selectCloud failed:', e);
            throw e;
        }
    };

    return { selectCloud, isPending, clouds, isCloudsError, isFetchingClouds: isFetching, refetchClouds: refetch };
};

export const useAutoSelectCloud = () => {
    const { clouds, selectCloud, isFetchingClouds } = useCloudSession();
    const { isAuthenticated } = useWebCoreStore();
    const autoSelectedRef = useRef(false);

    useEffect(() => {
        if (autoSelectedRef.current) return;
        if (!isAuthenticated) return;

        // If clouds fetch is done but list is empty, set default (only if no existing selection)
        if (!isFetchingClouds && clouds.length === 0) {
            const currentCloudId = cloudCore.getSelectedCloudId();
            if (!currentCloudId) {
                cloudCore.saveSelectedCloudId('default');
                autoSelectedRef.current = true;
            }
            return;
        }

        const activeCloud = clouds.find(c => c.status === 'active');
        if (!activeCloud) return;

        // Skip if user explicitly chose default (relay) mode
        const currentCloudId = cloudCore.getSelectedCloudId();
        if (currentCloudId === 'default') return;

        // Skip if already selected the same cloud
        const existingSession = getCloudSession();
        if (existingSession && currentCloudId === activeCloud.id) return;

        autoSelectedRef.current = true;
        void selectCloud(activeCloud.id as string);
    }, [clouds, isAuthenticated, isFetchingClouds]);
};
