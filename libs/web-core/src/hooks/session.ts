import { useCallback, useSyncExternalStore } from 'react';
import { useClouds, useRefreshCloudToken } from './index';
import { getGlobalSessionContext, getIdentityContext } from '../session';
import { getSessionAuthSnapshot } from '../session';
import { type LogoutOptions, logoutSession } from '../session/sessionLifecycle';
import { getSelectedCloudId, getSelectedSiteId } from '../session/selection';
import { subscribeSessionSignal } from '../session/utils';
import { refreshCloudSiteSessionUseCase, restoreInvitedCloudSessionUseCase } from '../session/useCases';

export const useRestoreInvitedCloudSession = () => ({
    restoreInvitedCloud: useCallback((cloudId: string) => restoreInvitedCloudSessionUseCase(cloudId), []),
});

export const useRefreshCloudSiteSession = () => {
    const { mutateAsync: refreshCloudToken, isPending } = useRefreshCloudToken();

    return {
        refreshSiteSession: useCallback(
            (siteId: string) =>
                refreshCloudSiteSessionUseCase({
                    siteId,
                    refreshCloudToken: target => refreshCloudToken({ target }),
                }),
            [refreshCloudToken]
        ),
        isRefreshingCloudToken: isPending,
    };
};

export const useCloudSessionCatalog = () => {
    const { isAuthenticated } = useSessionAuth();
    const { data, isError: isFetchError, isFetching, refetch } = useClouds({ limit: -1, enabled: isAuthenticated });

    return {
        clouds: data?.list ?? [],
        isCloudsError: !isFetching && isFetchError,
        isFetchingClouds: isFetching,
        refetchClouds: refetch,
    };
};

export const useSessionAuth = () =>
    useSyncExternalStore(subscribeSessionSignal, getSessionAuthSnapshot, getSessionAuthSnapshot);

export const useSessionIdentity = () =>
    useSyncExternalStore(subscribeSessionSignal, getIdentityContext, getIdentityContext);

export const useGlobalSession = () =>
    useSyncExternalStore(subscribeSessionSignal, getGlobalSessionContext, getGlobalSessionContext);

export const useSessionLogout = () => useCallback((options?: LogoutOptions) => logoutSession(options), []);

export const useSessionSelection = () =>
    useSyncExternalStore(
        subscribeSessionSignal,
        () => ({
            selectedCloudId: getSelectedCloudId(),
            selectedSiteId: getSelectedSiteId(),
            selectedPlaceId: getSelectedSiteId(),
        }),
        () => ({
            selectedCloudId: getSelectedCloudId(),
            selectedSiteId: getSelectedSiteId(),
            selectedPlaceId: getSelectedSiteId(),
        })
    );
