import { useMemo } from 'react';
import type { SocketSessionDelegate } from '@chatic/app-runtime';
import { getActiveServerIdentityToken, getGlobalSessionContext, useRefreshCloudSiteSession } from '@chatic/web-core';

/**
 * Provides the socket session delegate (token getter + re-auth refresh) consumed
 * by `RuntimeConnectionHost`. Ported from the testbed reference implementation.
 *
 * - `getSocketToken` returns the current active-server identity token.
 * - `refreshSocketToken` refreshes the active site session (if any) and returns
 *   the freshly minted token, letting the runtime re-authenticate on its own.
 */
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
