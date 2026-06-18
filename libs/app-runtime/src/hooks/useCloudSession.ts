import { useEffect, useRef } from 'react';
import { useIssueCloudToken, useRefreshCloudToken } from '@chatic/auth';
import { cloudCore, useWebCoreStore } from '@chatic/web-core';
import { useClouds } from '@chatic/users';
import {
    clearCloudSession,
    getCloudSessionSnapshot,
    refreshCloudPlaceSession,
    restoreInvitedCloudSession,
    selectCloudSession,
} from '../services/cloudSessionService';
import { useCloudTransitionStore } from '../stores/useCloudTransitionStore';

export const getCloudSession = getCloudSessionSnapshot;
export { clearCloudSession };

export const useCloudSession = () => {
    const { mutateAsync: issueCloudToken, isPending } = useIssueCloudToken();
    const { mutateAsync: refreshCloudToken, isPending: isRefreshingCloudToken } = useRefreshCloudToken();
    const { isAuthenticated } = useWebCoreStore();
    const { data, isError: isFetchError, isFetching, refetch } = useClouds({ limit: -1, enabled: isAuthenticated });

    const clouds = data?.list ?? [];
    const isCloudsError = !isFetching && isFetchError;

    const selectCloud = async (cloudId: string) => selectCloudSession({ cloudId, issueCloudToken });
    const restoreInvitedCloud = async (cloudId: string) => restoreInvitedCloudSession(cloudId);
    const refreshPlaceSession = async (placeId: string) => refreshCloudPlaceSession({ placeId, refreshCloudToken });

    return {
        selectCloud,
        restoreInvitedCloud,
        refreshPlaceSession,
        isPending,
        isRefreshingCloudToken,
        clouds,
        isCloudsError,
        isFetchingClouds: isFetching,
        refetchClouds: refetch,
    };
};

export const useAutoSelectCloud = () => {
    const { clouds, selectCloud, isFetchingClouds } = useCloudSession();
    const { isAuthenticated, isInvited } = useWebCoreStore();
    const autoSelectedRef = useRef(false);

    useEffect(() => {
        if (autoSelectedRef.current) return;
        if (!isAuthenticated) return;

        if (!isFetchingClouds && clouds.length === 0) {
            const currentCloudId = cloudCore.getSelectedCloudId();
            if (!currentCloudId) {
                cloudCore.saveSelectedCloudId('default');
                useWebCoreStore.getState().setSelectedCloudId('default');
                useCloudTransitionStore.getState().markReady('default', 'auto-select:default');
                autoSelectedRef.current = true;
            }
            return;
        }

        const activeCloud = clouds.find(c => c.status === 'active');
        if (!activeCloud) return;

        const currentCloudId = cloudCore.getSelectedCloudId();
        if (currentCloudId === 'default') return;

        const existingSession = getCloudSessionSnapshot();
        const currentCloudExists = clouds.some(c => c.id === currentCloudId);
        if (existingSession && currentCloudId && (currentCloudExists || isInvited)) {
            useCloudTransitionStore.getState().markReady(currentCloudId, 'auto-select:existing');
            return;
        }

        autoSelectedRef.current = true;
        void selectCloud(activeCloud.id as string);
    }, [clouds, isAuthenticated, isFetchingClouds, isInvited, selectCloud]);
};
