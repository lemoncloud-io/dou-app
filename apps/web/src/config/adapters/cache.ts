import { defineAdapter, webLocalCachePorts } from '@chatic/runtime-web';
import type { StorageStores, WebHostFacts } from '@chatic/runtime-web';

import { recordCacheRoutes } from '../../app/runtime/activeStorage';

type LocalCachePorts = ReturnType<typeof webLocalCachePorts>;

export const recordingRoutes = (ports: LocalCachePorts): LocalCachePorts => ({
    ...ports,
    routed: routes => {
        recordCacheRoutes(routes);
        ports.routed(routes);
    },
});

export const cacheWebLocal = (stores: Pick<StorageStores, 'webSession'>) =>
    defineAdapter<'cache', WebHostFacts>({
        id: 'cache.web-local',
        port: 'cache',
        create: () => recordingRoutes(webLocalCachePorts(stores.webSession)),
    });
