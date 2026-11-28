import { authLocation, defineRuntime, foregroundVisibility, transportBrowser, webHostFacts } from '@chatic/runtime-web';

import { webConfigPorts } from './adapters/config';
import { cacheAdminWebStorage, storageAdminTab } from './adapters';

export const admin = defineRuntime({
    name: 'admin',
    facts: webHostFacts,
    ports: {
        storage: { default: storageAdminTab },
        transport: { default: transportBrowser },
        auth: { default: authLocation },
        db: { default: cacheAdminWebStorage },
        foreground: { default: foregroundVisibility },
    },
    constraints: [],
    config: webConfigPorts,
});
