import { useEffect, useRef } from 'react';
import { useIssueCloudToken } from '@chatic/auth';
import { useGlobalLoader } from '@chatic/shared';
import { useClouds } from '@chatic/users';
import { cloudCore, hasCachedInitData, useWebCoreStore } from '@chatic/web-core';
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
    const { isAuthenticated, setProfile } = useWebCoreStore();
    const { setIsLoading } = useGlobalLoader();
    const { data, isError: isFetchError, isFetching, refetch } = useClouds({ limit: -1, enabled: isAuthenticated });

    const clouds = data?.list ?? [];
    const isCloudsError = !isFetching && isFetchError;

    const selectCloud = async (cloudId: string) => {
        // Skip full-screen loader when cached data is available (background cloud init)
        if (!hasCachedInitData()) {
            setIsLoading(true, t('globalLoader.switchingCloud'));
        }
        try {
            const { cloudDelegationToken, userToken } = await issueCloudToken(cloudId);

            cloudCore.saveDelegationToken(cloudDelegationToken);
            cloudCore.saveCloudToken(userToken);
            cloudCore.saveSelectedCloudId(cloudId);

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

    return { selectCloud, isPending, clouds, isCloudsError, isFetchingClouds: isFetching, refetchClouds: refetch };
};

export const useAutoSelectCloud = () => {
    const { clouds, selectCloud, isFetchingClouds } = useCloudSession();
    const { isAuthenticated } = useWebCoreStore();
    const autoSelectedRef = useRef(false);

    useEffect(() => {
        console.log('[useAutoSelectCloud] Check conditions:', {
            autoSelectedRef: autoSelectedRef.current,
            isAuthenticated,
            hasCloudSession: !!getCloudSession(),
            cloudsCount: clouds.length,
            clouds,
        });

        if (autoSelectedRef.current) {
            console.log('[useAutoSelectCloud] Skip: already selected');
            return;
        }
        if (!isAuthenticated) {
            console.log('[useAutoSelectCloud] Skip: not authenticated');
            return;
        }

        // If clouds fetch is done but list is empty, set default (only if no existing selection)
        if (!isFetchingClouds && clouds.length === 0) {
            const currentCloudId = cloudCore.getSelectedCloudId();
            if (!currentCloudId) {
                console.log('[useAutoSelectCloud] No clouds found, setting default');
                cloudCore.saveSelectedCloudId('default');
                autoSelectedRef.current = true;
            }
            return;
        }

        const activeCloud = clouds.find(c => c.status === 'active');
        if (!activeCloud) {
            console.log('[useAutoSelectCloud] Skip: no active cloud');
            return;
        }

        // Skip if user explicitly chose default (relay) mode
        const currentCloudId = cloudCore.getSelectedCloudId();
        if (currentCloudId === 'default') {
            console.log('[useAutoSelectCloud] Skip: user chose default (relay) mode');
            return;
        }

        // Skip if already selected the same cloud
        const existingSession = getCloudSession();
        if (existingSession && currentCloudId === activeCloud.id) {
            console.log('[useAutoSelectCloud] Skip: already selected this cloud', currentCloudId);
            return;
        }

        console.log('[useAutoSelectCloud] Selecting cloud:', activeCloud.id);
        autoSelectedRef.current = true;
        void selectCloud(activeCloud.id as string);
    }, [clouds, isAuthenticated, isFetchingClouds]);
};
