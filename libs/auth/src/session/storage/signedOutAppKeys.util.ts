import type { KeyValueStore } from '@chatic/storage';

/**
 * Keys the app writes that a sign-out takes, by the prefix of their names: the web log pipeline
 * (`@chatic/web.log.*` — unsent batches, their heartbeats, the tab id, the crash sentinel) and the
 * telemetry policy (`@chatic/web.telemetry.policy*`). The logs carry the account that just left.
 *
 * They are cleared from the session's plain medium — `localStorage` inside a shell, `sessionStorage`
 * in a browser — which is the storage a sign-out has always taken them from. A browser's
 * `localStorage` upload queue is not in it, and stays.
 */
export const SIGNED_OUT_APP_KEY_PREFIXES = ['@chatic/web.log.', '@chatic/web.telemetry.policy'] as const;

/** Removes every signed-out app key from `store`. Collected first: removing while walking shifts it. */
export const dropSignedOutAppKeys = (store: KeyValueStore): void => {
    store
        .keys()
        .filter(key => SIGNED_OUT_APP_KEY_PREFIXES.some(prefix => key.startsWith(prefix)))
        .forEach(key => store.remove(key));
};
