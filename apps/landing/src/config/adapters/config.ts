import { createWebEnvAdapter, type ConfigRuntimePorts } from '@chatic/config';
import { asDomStorage } from '@chatic/storage';

import { localStore, tabStore } from '../../app/storage';

export const landingConfigPorts = (env: (name: string) => string | undefined): ConfigRuntimePorts => ({
    env: createWebEnvAdapter(env),
    storage: { local: asDomStorage(localStore), session: asDomStorage(tabStore) },
});
