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

/** What the app's runtime is built from: the native handles the app opens, and its way home. */
export interface MobileRuntimeSources {
    /** The device vault the WebView's pages keep their secrets in. */
    vault: DeviceVault;
    /** One key-value file per plain store, the runtime's alone (`openRuntimeStorageFiles`). */
    files: { plain: KeyValueFile; device: KeyValueFile };
    /** The services the cache's messages are answered with — the app's SQLite. */
    cache: CacheMessageServices;
    /** The build's values by name (react-native-config's `Config`). */
    env: (name: string) => string | undefined;
    /** The user agent this device reports everywhere, the WebView's included. */
    userAgent: string;
    /** The host's way home once a session's end is saved for the next launch. */
    leaveToHome: MobileAuthOptions['leaveToHome'];
    /** Hears how the session's secrets were found, once the vault is loaded. */
    onSessionLoad: (load: NativeSessionLoad) => void;
}

/**
 * The app's runtime, declared: one adapter per port and no alternatives, so every port is fixed to what
 * the app has always run. A `port.*` toggle in config — a `VITE_PORT_<PORT>` in the env file, say — names
 * no adapter this declaration allows, and the port stays on its default, with the reason logged.
 *
 * - `storage` — the session's secrets in the vault the pages use (the same item and keys, so a session
 *   a page signed in is the one the runtime reads), `plain` and `device` in MMKV files of the runtime's
 *   own: the app's other files hold its own values, and a store's `clear` empties its whole file.
 * - `cache` — the app's SQLite, through the handlers that answer the pages' cache messages.
 * - `transport`, `auth`, `foreground` — React Native's network, `AppState` and sockets, and the address a
 *   session ended with carried to the next launch in `plain`.
 *
 * `config` hands `@chatic/config` its ports — the build's values, with `CHATIC_APP_PLATFORM` answered by
 * `Platform.OS` — and `startRuntime` initialises config with them before it reads a toggle.
 *
 * Which side owns the session is not a port here. The app settles it before anything loads the runtime
 * (`launchSessionOwner`), and only a launch it gives to the app starts this declaration.
 */
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

/** The tag the start logs each port's choice under; the owner's line joins them. */
const RUNTIME_PORT_LOG_TAG = 'app.runtime_port';

/** What the boot is handed beyond the runtime's sources. */
export interface StartMobileRuntimeOptions extends Omit<MobileRuntimeSources, 'onSessionLoad'> {
    /** Who owns the session this launch and why — logged with the port choices. */
    owner: SessionOwnerChoice;
    /** The app's logger. */
    logger: Pick<Logger, 'info'>;
}

/**
 * Boots the app's runtime, in the order the app has always booted it:
 *
 * 1. the build's values, checked first — a build without them throws `NativeRuntimeEnvError` having
 *    started nothing, so the page keeps the session;
 * 2. the start (`startRuntime`): config initialised from the declaration, the port choices logged, the
 *    vault waited for and the secret store loaded (`NativeRuntimeNoSessionError`, having created
 *    nothing, when it holds no session), then the other ports and the engine over them.
 *
 * Answers what the host logs once the runtime runs: the engine, and how the vault was found.
 * `options` is for tests; production leaves it out.
 */
export const startMobileRuntime = async (
    { owner, logger, ...sources }: StartMobileRuntimeOptions,
    options: StartRuntimeOptions = {}
): Promise<NativeRuntimeBoot> => {
    const missing = missingNativeRuntimeEnv(sources.env);
    if (missing.length > 0) throw new NativeRuntimeEnvError(missing);

    logger.info(RUNTIME_PORT_LOG_TAG, `[mobile] owner → ${owner.owner} (${owner.source})`, {
        data: { runtime: 'mobile', owner: owner.owner, source: owner.source },
    });

    // A holder rather than a `let`: the callback writes it, and a narrowed `let` would read as `null`
    // here because TypeScript does not follow an assignment made inside a callback.
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
    // `engine.core` — the declaration's engine — always builds one, over a storage it loaded first.
    const load = loaded.value;
    if (!started.engine || !load) throw new Error('[mobile] the runtime started without an engine');
    return { engine: started.engine, vault: load.vault, secretStorage: load.secretStorage };
};
