import { Platform } from 'react-native';

import { createWebEnvAdapter } from '@chatic/config';
import type { Logger } from '@chatic/logger';
import {
    NativeRuntimeEnvError,
    authMobile,
    cacheMobileSqlite,
    defineRuntime,
    foregroundAppState,
    missingNativeRuntimeEnv,
    mobileHostFacts,
    startRuntime,
    storageMobileVault,
    transportMobile,
} from '@chatic/runtime-mobile';
import type {
    DeviceVault,
    KeyValueFile,
    MobileAuthOptions,
    NativeHostFacts,
    NativeRuntimeBoot,
    NativeSessionLoad,
    RuntimeDeclaration,
    StartRuntimeOptions,
} from '@chatic/runtime-mobile';

import { createCacheMessageHandlers } from '../app/services/cache/cacheMessages';
import type { CacheMessageServices } from '../app/services/cache/cacheMessages';
import { createInProcessCacheClient } from '../app/services/cache/inProcessCacheClient';
import type { SessionOwnerChoice } from '../app/services/runtime/sessionOwner';

export interface MobileRuntimeSources {
    vault: DeviceVault;
    files: { plain: KeyValueFile; device: KeyValueFile };
    cache: CacheMessageServices;
    env: (name: string) => string | undefined;
    userAgent: string;
    leaveToHome: MobileAuthOptions['leaveToHome'];
    onSessionLoad: (load: NativeSessionLoad) => void;
}

export const mobile = ({
    vault,
    files,
    cache,
    env,
    userAgent,
    leaveToHome,
    onSessionLoad,
}: MobileRuntimeSources): RuntimeDeclaration<NativeHostFacts> =>
    defineRuntime({
        name: 'mobile',
        facts: mobileHostFacts({ userAgent }),
        ports: {
            storage: { default: storageMobileVault({ vault, files, onLoad: onSessionLoad }) },
            transport: { default: transportMobile },
            auth: { default: authMobile({ leaveToHome }) },
            cache: { default: cacheMobileSqlite(createInProcessCacheClient(createCacheMessageHandlers(cache))) },
            foreground: { default: foregroundAppState },
        },
        constraints: [],
        config: {
            env: createWebEnvAdapter(name => (name === 'CHATIC_APP_PLATFORM' ? Platform.OS : env(name))),
        },
    });

const RUNTIME_PORT_LOG_TAG = 'app.runtime_port';

export interface StartMobileRuntimeOptions extends Omit<MobileRuntimeSources, 'onSessionLoad'> {
    owner: SessionOwnerChoice;
    logger: Pick<Logger, 'info'>;
}

export const startMobileRuntime = async (
    { owner, logger, ...sources }: StartMobileRuntimeOptions,
    options: StartRuntimeOptions = {}
): Promise<NativeRuntimeBoot> => {
    const missing = missingNativeRuntimeEnv(sources.env);
    if (missing.length > 0) throw new NativeRuntimeEnvError(missing);

    logger.info(RUNTIME_PORT_LOG_TAG, `[mobile] owner → ${owner.owner} (${owner.source})`, {
        data: { runtime: 'mobile', owner: owner.owner, source: owner.source },
    });

    const loaded: { value: NativeSessionLoad | null } = { value: null };
    const started = await startRuntime(
        mobile({
            ...sources,
            onSessionLoad: next => {
                loaded.value = next;
            },
        }),
        options
    );
    const load = loaded.value;
    if (!started.engine || !load) throw new Error('[mobile] the runtime started without an engine');
    return { engine: started.engine, vault: load.vault, secretStorage: load.secretStorage };
};
