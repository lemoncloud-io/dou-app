import { defineAdapter, webLocalCachePorts } from '@chatic/runtime-web';
import type { WebHostFacts } from '@chatic/runtime-web';

import { deviceStore, tabStore } from '../../app/storage';

export const storageAdminTab = defineAdapter<'storage', WebHostFacts>({
    id: 'storage.admin-tab',
    port: 'storage',
    create: () => ({ secret: tabStore, plain: tabStore, device: deviceStore, tab: tabStore }),
});

export const cacheAdminWebStorage = defineAdapter<'db', WebHostFacts>({
    id: 'db.admin-web-storage',
    port: 'db',
    create: () => webLocalCachePorts(tabStore),
});
