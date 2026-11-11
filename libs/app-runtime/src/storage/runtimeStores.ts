import { TolerantStore, WebStore } from '@chatic/storage';

import type { KeyValueStore } from '@chatic/storage';

/**
 * The two stores the runtime's own non-session state lives in.
 *
 * - `device` — survives closing the tab: the sync cursor watermark. Tolerant.
 * - `tab` — dies with the tab: the invited clouds a browser tab entered. Raw, not tolerant: it holds a
 *   cache, and the cache engine must hear that a write did not land rather than report it stored.
 *
 * The entry point hands them over in `initAppRuntime({ storage })`, from the same
 * `resolveStorageStores` call that built the session's stores. Until then they are this page's two web
 * storages, which is what they were before an entry point could choose — so a test, or a module read
 * before the boot, sees the same storage the booted app does.
 *
 * The watermark is a convenience, so a full or blocked storage costs the value, not the boot.
 */
export interface RuntimeStorePorts {
    device: KeyValueStore;
    tab: KeyValueStore;
}

const defaults = (): RuntimeStorePorts => ({
    device: new TolerantStore(WebStore.local()),
    tab: WebStore.session(),
});

let ports: RuntimeStorePorts | null = null;

export const runtimeStores = {
    device(): KeyValueStore {
        ports ??= defaults();
        return ports.device;
    },
    tab(): KeyValueStore {
        ports ??= defaults();
        return ports.tab;
    },
    configure(next: Partial<RuntimeStorePorts>): void {
        ports = { ...(ports ?? defaults()), ...next };
    },
    /** Tests only: back to the defaults. */
    reset(): void {
        ports = null;
    },
};
