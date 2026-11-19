import { createWebEnvAdapter, type ConfigRuntimePorts } from '@chatic/config';
import { asDomStorage } from '@chatic/storage';

import { localStore, tabStore } from '../../app/storage';

/**
 * `@chatic/config`'s ports for the session runtime: the build's `VITE_*` values, read through the reader
 * the account surface's server was read with (`app/config/subscriptionServer.ts`, which keeps the one
 * `import.meta` read), and the site's local and tab stores as config's two lanes.
 */
export const landingConfigPorts = (env: (name: string) => string | undefined): ConfigRuntimePorts => ({
    env: createWebEnvAdapter(env),
    storage: { local: asDomStorage(localStore), session: asDomStorage(tabStore) },
});
