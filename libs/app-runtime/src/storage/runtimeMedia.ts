import { TolerantMedium, WebMedium } from '@chatic/storage';

import type { KeyValueStore } from '@chatic/storage';

/**
 * The two media the runtime's own non-session state lives in.
 *
 * - `device` — survives closing the tab: the sync cursor watermark. Tolerant.
 * - `tab` — dies with the tab: the invited clouds a browser tab entered. Raw, not tolerant: it holds a
 *   cache, and the cache engine must hear that a write did not land rather than report it stored.
 *
 * The entry point hands them over in `initAppRuntime({ storage })`, from the same
 * `resolveStorageMedia` call that built the session's media. Until then they are this page's two web
 * storages, which is what they were before an entry point could choose — so a test, or a module read
 * before the boot, sees the same storage the booted app does.
 *
 * The watermark is a convenience, so a full or blocked storage costs the value, not the boot.
 */
export interface RuntimeMediaPorts {
    device: KeyValueStore;
    tab: KeyValueStore;
}

const defaults = (): RuntimeMediaPorts => ({
    device: new TolerantMedium(WebMedium.local()),
    tab: WebMedium.session(),
});

let ports: RuntimeMediaPorts | null = null;

export const runtimeMedia = {
    device(): KeyValueStore {
        ports ??= defaults();
        return ports.device;
    },
    tab(): KeyValueStore {
        ports ??= defaults();
        return ports.tab;
    },
    configure(next: Partial<RuntimeMediaPorts>): void {
        ports = { ...(ports ?? defaults()), ...next };
    },
    /** Tests only: back to the defaults. */
    reset(): void {
        ports = null;
    },
};
