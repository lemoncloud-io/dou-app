import { useCallback } from 'react';
import { useIssueCloudToken, useRefreshCloudToken } from '../hooks';
import { useClouds } from '../hooks';
import { useWebCoreStore } from '../stores';
import { getSessionIdentityContext } from './contexts';
import {
    refreshCloudSiteSessionUseCase,
    restoreInvitedCloudSessionUseCase,
    switchCloudSessionUseCase,
} from './usecases';

export const useSwitchCloudSession = () => {
    const { mutateAsync: issueCloudToken, isPending } = useIssueCloudToken();

    return {
        switchCloud: useCallback(
            (cloudId: string) => switchCloudSessionUseCase({ cloudId, issueCloudToken }),
            [issueCloudToken]
        ),
        isPending,
    };
};

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
    const { isAuthenticated } = useWebCoreStore();
    const { data, isError: isFetchError, isFetching, refetch } = useClouds({ limit: -1, enabled: isAuthenticated });

    return {
        clouds: data?.list ?? [],
        isCloudsError: !isFetching && isFetchError,
        isFetchingClouds: isFetching,
        refetchClouds: refetch,
    };
};

export const useSessionIdentity = () => getSessionIdentityContext();
