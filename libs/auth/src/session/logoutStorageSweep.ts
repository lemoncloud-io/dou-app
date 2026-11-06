import { sessionMedia } from '@chatic/session';
import { lemonKeyPrefix, lemonStorage } from '@chatic/transport';

import type { KeyValueStore } from '@chatic/storage';
import type { ILogoutStorageSweeper } from './types';

/** Keys the app itself writes under `@` that a sign-out takes, by prefix of their names. */
const SIGNED_OUT_APP_KEYS = ['@chatic/web.log.', '@chatic/web.telemetry.policy'] as const;
const LANGUAGE_SUFFIX = '.i18nextLng';
const RETIRED_OAUTH_PROVIDER_KEY = 'chatic-oauth-provider';

// Collected first: removing while walking a key list shifts the indices under it.
const removeWhere = (store: KeyValueStore, doomed: (key: string) => boolean): void => {
    store
        .keys()
        .filter(doomed)
        .forEach(key => store.remove(key));
};

/**
 * The other half of `RelaySession.logout()` — the reader of its `?logout=1` flag.
 *
 * Logout redirects to `/?logout=1` and the tab reloads, so the sign-out and the cleanup happen in
 * two different page lifetimes: the code that decides to log out is gone by the time the new
 * document can clear anything. The flag is the message between them, and this is what receives it.
 *
 * **Three owners, each cleared by name.** This used to clear the whole `@` namespace of the session's
 * storage, because lemon-web-core's names were taken to be its own business. A namespace sweep also
 * deletes whatever else moves in under `@` — it already had to carve out the config lane, which
 * moved in after it — so each part is now asked for by its owner instead:
 *
 *   - **lemon-web-core's credential bundle** — `@<project>.*` in the medium the transport handed the
 *     SDK. The SDK picks the names after the prefix; the prefix is ours. The language key
 *     (`@<project>.i18nextLng`) shares it and is kept: it is the language in effect, not a credential.
 *   - **The web log pipeline and the telemetry policy**, by name — `@chatic/web.log.*` (unsent
 *     batches, their heartbeats, the tab id, the crash sentinel) and `@chatic/web.telemetry.policy*`.
 *     The app writes them, not the session; they are on this list only because the namespace sweep
 *     took them, and only from the storage it walked — the session's plain medium. So inside a shell
 *     (localStorage) the upload queue and the policy go, while in a browser (sessionStorage) only the
 *     tab id and the crash sentinel do, and the localStorage queue stays, as it always has.
 *   - **A retired session key**, `chatic-oauth-provider`, from both storages. Nothing writes it any
 *     more; a device that still holds one from an older build loses it here.
 *
 * Together these are exactly the keys the namespace sweep removed: nothing else the app writes sits
 * under `@` but the config lane and the language key, which both sweeps keep.
 * `logoutStorageSweep.test.ts` pins that list.
 *
 * **Where it runs.** From `initAppRuntime`, before any wiring that can read a token. It used to be
 * an import side effect of `@chatic/web-config`; ADR-0079 retired that module and named the app boot
 * as the new home, which is this call (session hygiene is not configuration).
 */
class LogoutStorageSweeper implements ILogoutStorageSweeper {
    sweep(): void {
        if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return;

        try {
            if (new URLSearchParams(window.location.search).get('logout') !== '1') return;

            const lemonPrefix = lemonKeyPrefix();
            removeWhere(lemonStorage(), key => key.startsWith(lemonPrefix) && !key.endsWith(LANGUAGE_SUFFIX));

            removeWhere(sessionMedia.of('plain'), key => SIGNED_OUT_APP_KEYS.some(prefix => key.startsWith(prefix)));

            sessionStorage.removeItem(RETIRED_OAUTH_PROVIDER_KEY);
            localStorage.removeItem(RETIRED_OAUTH_PROVIDER_KEY);
        } catch {
            // Storage access throws in a few browser configurations. A missed sweep costs a stale
            // bundle that the next login overwrites anyway — never a failed boot.
        }
    }
}

export const logoutStorageSweeper: ILogoutStorageSweeper = new LogoutStorageSweeper();
