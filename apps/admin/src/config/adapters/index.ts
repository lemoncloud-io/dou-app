import { defineAdapter, webLocalCachePorts } from '@chatic/runtime-web';
import type { WebHostFacts } from '@chatic/runtime-web';

import { deviceStore, tabStore } from '../../app/storage';

export const storageAdminTab = defineAdapter<'storage', WebHostFacts>({
    id: 'storage.admin-tab',
    port: 'storage',
    create: () => ({ secret: tabStore, plain: tabStore, device: deviceStore }),
});

export const cacheAdminWebStorage = defineAdapter<'cache', WebHostFacts>({
    id: 'cache.admin-web-storage',
    port: 'cache',
    create: () => webLocalCachePorts(tabStore),
});
