import { logger } from '@chatic/logger';

import { attachConfigStateLog } from './config/configStateLog';
import { configureDataRuntime, getDataManager, getRepositories } from './data/runtime';
import { applyPendingSyncCursorReset } from './data/syncCursorWatermark';
import { runtimeStores } from './storage/runtimeStores';
import { localCachePlatform } from './data/localCachePlatform';
import { foregroundPlatform } from './session/foreground';
import { coreEngine } from './engine';
import type { RuntimeEngine } from './engine';
import { credentialRecovery, transportPlatform } from '@chatic/transport';
import {
    authPlatform,
    authRepositorySource,
    dropLemonLeftovers,
    logoutStorageSweeper,
    credentialRenewers,
    signedOutAppKeys,
} from '@chatic/auth';
import { configureSessionStore, sessionStores } from '@chatic/session';
import { syncDataGraph } from '@chatic/sync';

import type { HttpRoute } from '@chatic/http';
import type { DataRuntimeConfig } from './data/runtime';
import type { RuntimePorts } from './ports';

export interface RuntimeConfig extends RuntimePorts {
    data?: DataRuntimeConfig;
    signedOutKeyPrefixes?: readonly string[];
}

let booted = false;

export const createRuntime = (config: RuntimeConfig): RuntimeEngine => {
    if (booted) {
        logger.warn('WEB_CORE', '[createRuntime] called more than once; the runtime is already booted');
    }
    booted = true;

    const { secret, plain, device } = config.storage;
    sessionStores.configure({ secret, plain });
    runtimeStores.configure({ device });
    transportPlatform.configure(config.transport);
    authPlatform.configure(config.auth);
    localCachePlatform.configure(config.cache);
    foregroundPlatform.configure(config.foreground);

    dropLemonLeftovers(sessionStores.of('plain'));

    signedOutAppKeys.register(config.signedOutKeyPrefixes ?? []);

    logoutStorageSweeper.sweep();

    applyPendingSyncCursorReset();

    configureSessionStore();
    credentialRecovery.register((_route: HttpRoute) => credentialRenewers.relay.renew());

    if (config.data) {
        configureDataRuntime(config.data);
    }

    authRepositorySource.provide(() => getRepositories().auth);
    syncDataGraph.provide(getDataManager);

    attachConfigStateLog();

    return coreEngine;
};
