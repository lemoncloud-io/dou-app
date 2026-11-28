import { defineAdapter, webLocalCachePorts } from '@chatic/runtime-web';
import type { WebHostFacts } from '@chatic/runtime-web';

import { deviceStore, tabStore } from '../../app/storage';

export const storageLandingTab = defineAdapter<'storage', WebHostFacts>({
    id: 'storage.landing-tab',
    port: 'storage',
    create: () => ({ secret: tabStore, plain: tabStore, device: deviceStore, tab: tabStore }),
});

export const cacheLandingWebStorage = defineAdapter<'db', WebHostFacts>({
    id: 'db.landing-web-storage',
    port: 'db',
    create: () => webLocalCachePorts(tabStore),
});
