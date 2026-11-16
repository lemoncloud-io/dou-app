import { keyValueStoreOn, nativeLocalCachePorts, nativeSecretStore } from '@chatic/runtime-mobile';
import type { DeviceVault, KeyValueFile, NativeRuntimeOptions } from '@chatic/runtime-mobile';
import type { NativeStore } from '@chatic/storage';

import { createCacheMessageHandlers } from '../cache/cacheMessages';
import type { CacheMessageServices } from '../cache/cacheMessages';
import { createInProcessCacheClient } from '../cache/inProcessCacheClient';

/** Where the runtime's stores and cache live on this device. */
export interface RuntimePortSources {
    /** The device vault the WebView's pages keep their secrets in. */
    vault: DeviceVault;
    /** One key-value file per plain store, the runtime's alone. */
    files: { plain: KeyValueFile; device: KeyValueFile };
    /** The services the cache's messages are answered with. */
    cache: CacheMessageServices;
}

export interface RuntimePorts {
    /** `secret` is not loaded yet: the boot loads it before the runtime is created. */
    storage: NativeRuntimeOptions['storage'] & { secret: NativeStore };
    cache: NativeRuntimeOptions['cache'];
}

/**
 * The stores and the cache a runtime in this process is created with.
 *
 * - `secret` is the vault the pages use — the same item and the same keys, so a session a page signed
 *   in is the one this runtime reads, with nothing to move.
 * - `plain` and `device` are files of their own. The app's other MMKV files hold the app's values,
 *   JSON-encoded, and a store's `clear` empties its whole file, so the runtime never shares one.
 * - The cache is the app's SQLite, through the handlers that answer the pages' cache messages.
 */
export const buildRuntimePorts = ({ vault, files, cache }: RuntimePortSources): RuntimePorts => ({
    storage: {
        secret: nativeSecretStore(vault),
        plain: keyValueStoreOn(files.plain),
        device: keyValueStoreOn(files.device),
    },
    cache: nativeLocalCachePorts(createInProcessCacheClient(createCacheMessageHandlers(cache))),
});
