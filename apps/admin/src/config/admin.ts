import { authLocation, defineRuntime, foregroundVisibility, transportBrowser, webHostFacts } from '@chatic/runtime-web';

import { webConfigPorts } from '../app/config/adapters';
import { cacheAdminWebStorage, storageAdminTab } from './adapters';

/**
 * The console's runtime, declared: one adapter per port and no alternatives, so every port is fixed to
 * what admin has always run. A `port.*` toggle in config — say a local override left in this browser —
 * names no adapter this declaration allows, and the port stays on its default, with the reason logged.
 *
 * `config` hands `@chatic/config` its ports, and `startRuntime` initialises config with them before it
 * reads a toggle — synchronously, at the point the entry's own `config.init` used to run. Nothing the
 * entry runs reads config earlier, so leaving the call to the start changes no order.
 */
export const admin = defineRuntime({
    name: 'admin',
    facts: webHostFacts,
    ports: {
        storage: { default: storageAdminTab },
        transport: { default: transportBrowser },
        auth: { default: authLocation },
        cache: { default: cacheAdminWebStorage },
        foreground: { default: foregroundVisibility },
    },
    constraints: [],
    config: webConfigPorts,
});
