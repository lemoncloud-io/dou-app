import { useMemo } from 'react';
import type { SocketSessionDelegate } from '@chatic/app-runtime';
import { getActiveServerIdentityToken, getGlobalSessionContext, useRefreshCloudSiteSession } from '@chatic/web-core';

export const useSocketDelegate = (): SocketSessionDelegate => {
    const { refreshSiteSession } = useRefreshCloudSiteSession();

    return useMemo(
        () => ({
            getSocketToken: async () => getActiveServerIdentityToken(),
            refreshSocketToken: async () => {
                const siteId = getGlobalSessionContext().activeServer.siteId;
                if (siteId) {
                    await refreshSiteSession(siteId);
                }
                return getActiveServerIdentityToken();
            },
        }),
        [refreshSiteSession]
    );
};
