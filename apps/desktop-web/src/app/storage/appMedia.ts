import { SwitchableMedium, TolerantMedium, WebMedium } from '@chatic/storage';

import type { KeyValueStore } from '@chatic/storage';

/**
 * The three media this app's features keep their own state in.
 *
 * - `device` — outlives the window (`localStorage`).
 * - `tab` — dies with the window (`sessionStorage`).
 * - `plain` — the session's plain medium: `localStorage` in the desktop shell, `sessionStorage` in a
 *   browser tab. For state that travels with a sign-in — the OAuth start a relaunch must find, the
 *   notice the signed-in window shows once.
 *
 * What each holds is listed in `apps/desktop-web/docs/storage/README.md`.
 *
 * `main.tsx` points them at the media `resolveStorageMedia()` built. A feature never names a web
 * storage itself — it takes one of these two, which is what lets the entry point decide where its
 * state lives (and what the lint rule on `localStorage`/`sessionStorage` enforces).
 *
 * They are switchable media: zustand's `persist` and the i18n module take their storage at import
 * time, before `main.tsx` has run, so each call goes to whichever medium the entry point configured.
 * Until then `device` and `tab` are this window's two web storages, tolerant of a full or blocked one —
 * the same media the entry point hands over — and `plain` is the tab's `sessionStorage`, the session's
 * own default.
 */
interface AppMediaPorts {
    device: KeyValueStore;
    tab: KeyValueStore;
    plain: KeyValueStore;
}

const device = new SwitchableMedium(new TolerantMedium(WebMedium.local()));
const tab = new SwitchableMedium(new TolerantMedium(WebMedium.session()));
// Raw, like the session's own port: a sign-in hand-off that did not land must say so.
const plain = new SwitchableMedium(WebMedium.session());

export const deviceMedium: KeyValueStore = device;
export const tabMedium: KeyValueStore = tab;
export const plainMedium: KeyValueStore = plain;

/** Called once from `main.tsx`, with the media `resolveStorageMedia()` built. */
export const configureAppMedia = (next: AppMediaPorts): void => {
    device.use(next.device);
    tab.use(next.tab);
    plain.use(next.plain);
};
