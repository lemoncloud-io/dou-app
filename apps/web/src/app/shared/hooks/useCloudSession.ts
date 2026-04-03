import { useEffect, useRef } from 'react';
import { useIssueCloudToken } from '@chatic/auth';
import { useGlobalLoader } from '@chatic/shared';
import { useClouds } from '@chatic/users';
import { cloudCore, useWebCoreStore } from '@chatic/web-core';
import type { UserProfile$ } from '@lemoncloud/chatic-backend-api';
import { useTranslation } from 'react-i18next';

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
    const { t } = useTranslation();
    const { mutateAsync: issueCloudToken, isPending } = useIssueCloudToken();
    const { setProfile } = useWebCoreStore();
    const { setIsLoading } = useGlobalLoader();
    const { data, isError: isFetchError, isFetching, refetch } = useClouds();

    const clouds = data?.list ?? [];
    const isCloudsError = !isFetching && isFetchError;

    const selectPlace = async (placeId: string) => {
        setIsLoading(true, t('globalLoader.switchingCloud'));
        try {
            const { cloudDelegationToken, userToken } = await issueCloudToken(placeId);

            cloudCore.saveDelegationToken(cloudDelegationToken);
            cloudCore.saveCloudToken(userToken);
            cloudCore.saveSelectedCloudId(placeId);

            const currentProfile = useWebCoreStore.getState().profile;
            const { Token: _Token, ...cloudProfile } = userToken;
            setProfile({ ...currentProfile, ...cloudProfile } as unknown as UserProfile$);
        } catch (e) {
            console.error('[useCloudSession] selectPlace failed:', e);
            throw e;
        } finally {
            setIsLoading(false);
        }
    };

    return { selectPlace, isPending, clouds, isCloudsError, isFetchingClouds: isFetching, refetchClouds: refetch };
};

export const useAutoSelectCloud = () => {
    const { clouds, selectPlace } = useCloudSession();
    const { isAuthenticated } = useWebCoreStore();
    const autoSelectedRef = useRef(false);

    useEffect(() => {
        if (autoSelectedRef.current) return;
        if (!isAuthenticated) return;
        if (getCloudSession()) return;
        const activeCloud = clouds.find(c => c.status === 'active');
        if (!activeCloud) return;
        autoSelectedRef.current = true;
        void selectPlace(activeCloud.id as string);
    }, [clouds, isAuthenticated]);
};
