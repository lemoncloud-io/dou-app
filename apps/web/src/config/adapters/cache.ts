import { defineAdapter, webLocalCachePorts } from '@chatic/runtime-hybrid-web';
import type { StorageStores, WebHostFacts } from '@chatic/runtime-hybrid-web';

import { recordCacheRoutes } from '../../app/runtime/activeStorage';

type DbPort = ReturnType<typeof webLocalCachePorts>;

export const recordingRoutes = (ports: DbPort): DbPort => ({
    ...ports,
    routed: routes => {
        recordCacheRoutes(routes);
        ports.routed(routes);
    },
});

export const cacheWebLocal = (stores: Pick<StorageStores, 'webSession'>) =>
    defineAdapter<'db', WebHostFacts>({
        id: 'db.web-local',
        port: 'db',
        create: () => recordingRoutes(webLocalCachePorts(stores.webSession)),
    });
