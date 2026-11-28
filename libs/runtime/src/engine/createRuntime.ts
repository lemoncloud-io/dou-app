import { logger } from '@chatic/logger';

import { attachConfigStateLog } from './config/configStateLog';
import { configureDataRuntime, getDataManager, getRepositories } from './data/runtime';
import { applyPendingSyncCursorReset } from './data/syncCursorWatermark';
import { runtimeStores } from './storage/runtimeStores';
import { localCachePlatform } from './data/localCachePlatform';
import { foregroundPlatform } from './session/foreground';
import { coreEngine } from './engine';
import type { RuntimeEngine } from './engine';
import { absentPort, engineFor } from './moduleWiring';
import { allModules, moduleSetOf } from './modules';
import type { RuntimeModules, RuntimePortName } from './modules';
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

interface RuntimeConfigBase {
    data?: DataRuntimeConfig;
    signedOutKeyPrefixes?: readonly string[];
}

export type RuntimeConfig = RuntimeConfigBase &
    (
        | (RuntimePorts & { modules?: undefined })
        | (Pick<RuntimePorts, 'storage' | 'auth'> &
              Partial<Omit<RuntimePorts, 'storage' | 'auth'>> & { modules: RuntimeModules })
    );

const portFor = <P extends RuntimePortName>(config: RuntimeConfig, port: P, needed: boolean): RuntimePorts[P] => {
    const given = config[port] as RuntimePorts[P] | undefined;
    if (needed && given) return given;
    if (needed) {
        throw new Error(
            `[runtime] createRuntime() was not given the '${port}' port, which a module of this runtime needs`
        );
    }
    return absentPort(port);
};

let booted = false;

const absentDataGraph = (): never => {
    throw new Error(
        "[runtime] the repository graph is not wired — it needs the 'sockets' and 'http' modules and the 'db' port, " +
            'and this runtime was started without them'
    );
};

export const createRuntime = (config: RuntimeConfig): RuntimeEngine => {
    if (booted) {
        logger.warn('WEB_CORE', '[createRuntime] called more than once; the runtime is already booted');
    }
    booted = true;

    const modules = moduleSetOf(config.modules ?? allModules());

    const { secret, plain, device } = config.storage;
    sessionStores.configure({ secret, plain });
    runtimeStores.configure({ device });
    transportPlatform.configure(portFor(config, 'transport', modules.ports.has('transport')));
    authPlatform.configure(config.auth);
    localCachePlatform.configure(portFor(config, 'db', modules.ports.has('db')));
    foregroundPlatform.configure(portFor(config, 'foreground', modules.ports.has('foreground')));

    dropLemonLeftovers(sessionStores.of('plain'));

    signedOutAppKeys.register(config.signedOutKeyPrefixes ?? []);

    logoutStorageSweeper.sweep();

    if (modules.has('sync')) applyPendingSyncCursorReset();

    configureSessionStore();
    if (modules.has('http')) credentialRecovery.register((_route: HttpRoute) => credentialRenewers.relay.renew());

    if (config.data) {
        configureDataRuntime(config.data);
    }

    authRepositorySource.provide(modules.dataGraph ? () => getRepositories().auth : absentDataGraph);
    if (modules.has('sync')) syncDataGraph.provide(getDataManager);

    attachConfigStateLog();

    return engineFor(coreEngine, modules);
};
