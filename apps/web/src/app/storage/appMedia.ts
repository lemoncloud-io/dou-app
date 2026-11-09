import { TolerantMedium, WebMedium } from '@chatic/storage';

import type { KeyValueStore } from '@chatic/storage';

/**
 * The two media this app's features keep their own state in.
 *
 * - `device` — outlives the tab: drafts, input locks, the recent emoji, the push marks, the sent-invite
 *   log, the browser's log queue and telemetry policy.
 * - `tab` — dies with the tab: the pending invite channel, the log tab id, the crash sentinel, the
 *   debug unlock record.
 *
 * `main.tsx` points them at the media `resolveStorageMedia()` built. A feature never names a web
 * storage itself — it takes one of these two, which is what lets the entry point decide where its
 * state lives (and what the lint rule on `localStorage`/`sessionStorage` enforces).
 *
 * The exported media are stable delegates, not the media themselves: zustand's `persist` and a few
 * modules (i18n) take their storage at import time, before `main.tsx` has run. Each call resolves the
 * configured medium then, so a store created at import still writes where the entry point said. Until
 * `configureAppMedia` runs they are this page's two web storages, tolerant of a full or blocked one —
 * the same media the entry point hands over.
 */
interface AppMediaPorts {
    device: KeyValueStore;
    tab: KeyValueStore;
}

let ports: AppMediaPorts | null = null;

const current = (): AppMediaPorts => {
    ports ??= { device: new TolerantMedium(WebMedium.local()), tab: new TolerantMedium(WebMedium.session()) };
    return ports;
};

const delegate = (pick: (p: AppMediaPorts) => KeyValueStore): KeyValueStore => ({
    get: key => pick(current()).get(key),
    set: (key, value) => pick(current()).set(key, value),
    remove: key => pick(current()).remove(key),
    clear: () => pick(current()).clear(),
    keys: () => pick(current()).keys(),
});

export const deviceMedium: KeyValueStore = delegate(p => p.device);
export const tabMedium: KeyValueStore = delegate(p => p.tab);

/** Called once from `main.tsx`, with the media `resolveStorageMedia()` built. */
export const configureAppMedia = (next: AppMediaPorts): void => {
    ports = next;
};

/** Tests only: back to the defaults. */
export const resetAppMedia = (): void => {
    ports = null;
};
