import { SwitchableStore, TolerantStore, WebStore } from '@chatic/storage';

import type { KeyValueStore } from '@chatic/storage';

/**
 * The two stores this app's features keep their own state in.
 *
 * - `device` — outlives the tab: drafts, input locks, the recent emoji, the push marks, the sent-invite
 *   log, the browser's log queue and telemetry policy.
 * - `tab` — dies with the tab: the pending invite channel, the log tab id, the crash sentinel, the
 *   debug unlock record.
 *
 * `main.tsx` points them at the stores `resolveStorageStores()` built. A feature never names a web
 * storage itself — it takes one of these two, which is what lets the entry point decide where its
 * state lives (and what the lint rule on `localStorage`/`sessionStorage` enforces).
 *
 * The exported stores are `SwitchableStore` wrappers, not the web stores themselves:
 * zustand's `persist` and a few modules (i18n) take their storage at import time, before `main.tsx`
 * has run. Each call goes to the store configured by then, so a store created at import still
 * writes where the entry point said. Until `configureAppStores` runs they are this page's two web
 * storages, tolerant of a full or blocked one — the same stores the entry point hands over.
 */
interface AppStorePorts {
    device: KeyValueStore;
    tab: KeyValueStore;
}

const device = new SwitchableStore(new TolerantStore(WebStore.local()));
const tab = new SwitchableStore(new TolerantStore(WebStore.session()));

export const deviceStore: KeyValueStore = device;
export const tabStore: KeyValueStore = tab;

/** Called once from `main.tsx`, with the stores `resolveStorageStores()` built. */
export const configureAppStores = (next: AppStorePorts): void => {
    device.use(next.device);
    tab.use(next.tab);
};

/** Tests only: back to the defaults. */
export const resetAppStores = (): void => {
    device.reset();
    tab.reset();
};
