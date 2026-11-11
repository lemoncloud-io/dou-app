import type { KeyValueStore } from '@chatic/storage';

/**
 * The store the runtime's own non-session state lives in.
 *
 * - `device` — survives closing the tab: the sync cursor watermark. Tolerant: the watermark is a
 *   convenience, so a full or blocked storage costs the value, not the boot.
 *
 * The entry point hands it over in `initAppRuntime({ storage })`, from the same `resolveStorageStores`
 * call that built the session's stores. **There is no default**: reading it before then throws, like
 * the session's own ports — a default would be one platform's storage. (The tab-lifetime store a page
 * keeps its invited clouds in belongs to the web cache, `webLocalCachePorts(tab)` in
 * `@chatic/runtime-web`, not to the runtime.)
 */
export interface RuntimeStorePorts {
    device: KeyValueStore;
}

let ports: RuntimeStorePorts | null = null;

export const runtimeStores = {
    device(): KeyValueStore {
        if (!ports) {
            throw new Error(
                "[runtime-core] the runtime's device store was used before it was configured — the entry point " +
                    'has to pass `storage.device` to initAppRuntime().'
            );
        }
        return ports.device;
    },
    configure(next: RuntimeStorePorts): void {
        ports = next;
    },
    /** Tests only: back to unconfigured. */
    reset(): void {
        ports = null;
    },
};
