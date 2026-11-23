import { defineAdapter, webLocalCachePorts } from '@chatic/runtime-web';
import type { WebHostFacts } from '@chatic/runtime-web';

import { deviceStore, tabStore } from '../../app/storage';

export const storageLandingTab = defineAdapter<'storage', WebHostFacts>({
    id: 'storage.landing-tab',
    port: 'storage',
    create: () => ({ secret: tabStore, plain: tabStore, device: deviceStore }),
});

export const cacheLandingWebStorage = defineAdapter<'cache', WebHostFacts>({
    id: 'cache.landing-web-storage',
    port: 'cache',
    create: () => webLocalCachePorts(tabStore),
});
