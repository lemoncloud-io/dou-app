import { useEffect, useRef } from 'react';
import {
    clearCloudSession,
    cloudCore,
    getCloudSessionSnapshot,
    useCloudSessionCatalog,
    useRefreshCloudSiteSession,
    useRestoreInvitedCloudSession,
    useSwitchCloudSession,
    useWebCoreStore,
} from '@chatic/web-core';
import { type CloudSessionSnapshot } from '../services/cloudSessionService';
import { useCloudTransitionStore } from '../stores/useCloudTransitionStore';

export const getCloudSession = getCloudSessionSnapshot;
export { clearCloudSession };

export const useCloudSession = () => {
    const { switchCloud: selectCloud, isPending } = useSwitchCloudSession();
    const { restoreInvitedCloud } = useRestoreInvitedCloudSession();
    const { refreshSiteSession, isRefreshingCloudToken } = useRefreshCloudSiteSession();
    const { clouds, isCloudsError, isFetchingClouds, refetchClouds } = useCloudSessionCatalog();

    return {
        selectCloud,
        restoreInvitedCloud,
        refreshSiteSession,
        refreshPlaceSession: (siteId: string): Promise<CloudSessionSnapshot> => refreshSiteSession(siteId),
        isPending,
        isRefreshingCloudToken,
        clouds,
        isCloudsError,
        isFetchingClouds,
        refetchClouds,
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
