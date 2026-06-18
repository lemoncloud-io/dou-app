import { useEffect, useRef } from 'react';

import { cloudCore } from '../core';
import type { CloudSessionSnapshot } from '../session';
import {
    clearCloudSession,
    getCloudSessionSnapshot,
    setSelectedCloudId,
    useCloudSessionCatalog,
    useRefreshCloudSiteSession,
    useRestoreInvitedCloudSession,
    useSessionAuth,
    useSessionIdentity,
} from '../session';
import { useSwitchCloudSession } from './useSwitchCloudSession';

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
    const { isAuthenticated } = useSessionAuth();
    const { isInvited } = useSessionIdentity();
    const autoSelectedRef = useRef(false);

    useEffect(() => {
        if (autoSelectedRef.current) return;
        if (!isAuthenticated) return;

        if (!isFetchingClouds && clouds.length === 0) {
            const currentCloudId = cloudCore.getSelectedCloudId();
            if (!currentCloudId) {
                setSelectedCloudId('default');
                autoSelectedRef.current = true;
            }
            return;
        }

        const activeCloud = clouds.find((c: { status?: string }) => c.status === 'active');
        if (!activeCloud) return;

        const currentCloudId = cloudCore.getSelectedCloudId();
        if (currentCloudId === 'default') return;

        const existingSession = getCloudSessionSnapshot();
        const currentCloudExists = clouds.some((c: { id?: string }) => c.id === currentCloudId);
        if (existingSession && currentCloudId && (currentCloudExists || isInvited)) {
            return;
        }

        autoSelectedRef.current = true;
        void selectCloud(activeCloud.id as string);
    }, [clouds, isAuthenticated, isFetchingClouds, isInvited, selectCloud]);
};
