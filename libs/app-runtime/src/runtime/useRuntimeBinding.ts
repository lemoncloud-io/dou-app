import { useMemo } from 'react';

import type { DataContext } from '@chatic/data';
import { getGlobalSessionContext, useUserContext, useWebCoreStore } from '@chatic/web-core';

import type { SocketBindingConfig, SocketScope } from '../socket';
import { useDynamicDeviceId } from '../hooks';

export interface RuntimeBinding {
    context: DataContext;
    socket: {
        config: SocketBindingConfig;
        scope: SocketScope;
    } | null;
}

export const useRuntimeBinding = (): RuntimeBinding => {
    const { deviceId } = useDynamicDeviceId();
    const { currentWSS, endpoints } = useUserContext();
    const { selectedCloudId, selectedSiteId, profile } = useWebCoreStore();

    return useMemo(() => {
        const { activeTarget } = getGlobalSessionContext();
        const cid =
            currentWSS === 'cloud'
                ? selectedCloudId || (activeTarget.kind === 'cloud' ? activeTarget.cloudId : 'default')
                : 'default';
        const sid = selectedSiteId || (activeTarget.kind === 'cloud' ? activeTarget.siteId : null) || undefined;
        const uid = (profile?.uid as string | undefined) ?? undefined;
        const endpoint = currentWSS === 'cloud' ? endpoints.cloudWSS : endpoints.relayWSS;

        return {
            context: { cid, sid, uid },
            socket:
                deviceId && endpoint
                    ? {
                          config: {
                              url: endpoint,
                              deviceId,
                              wssType: currentWSS,
                          },
                          scope: {
                              cid,
                              sid: sid ?? null,
                              uid: uid ?? null,
                          },
                      }
                    : null,
        };
    }, [currentWSS, deviceId, endpoints.cloudWSS, endpoints.relayWSS, profile?.uid, selectedCloudId, selectedSiteId]);
};
