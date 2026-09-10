import { isNative } from '@chatic/bridges';

/**
 * The other half of `RelaySession.logout()` — the reader of its `?logout=1` flag.
 *
 * Logout redirects to `/?logout=1` and the tab reloads, so the sign-out and the cleanup happen in
 * two different page lifetimes: the code that decides to log out is gone by the time the new
 * document can clear anything. The flag is the message between them, and this is what receives it.
 *
 * **Why a sweep and not `removeItem` by name.** lemon-web-core owns its token bundle and writes it
 * as `@<project>.<name>` — the names are its business, not ours, and they have changed. Clearing the
 * whole `@` namespace is the only spelling that does not go stale behind the SDK.
 *
 * Two things share that namespace and are NOT session state, so both are preserved:
 *   - the i18n language key (`@<project>_<env>.i18nextLng`) — a preference, not a credential;
 *   - `@chatic/config`'s own lane (`storageKeyFor`, ADR-0079) — settings survive a logout, and this
 *     one is new: the sweep predates the registry, which moved in under the same prefix.
 *
 * **Where it runs.** From `initAppRuntime`, before any wiring that can read a token. It used to be
 * an import side effect of `@chatic/web-config`; ADR-0079 retired that module and named the app boot
 * as the new home, which is this call (session hygiene is not configuration).
 */
export interface ILogoutStorageSweeper {
    /** No-op unless the current URL carries `?logout=1`. Safe to call on every boot. */
    sweep(): void;
}

class LogoutStorageSweeper implements ILogoutStorageSweeper {
    /** lemon-web-core's token-bundle prefix (`@${project}`), shared by the keys listed below. */
    private static readonly SESSION_PREFIX = '@';
    private static readonly LANGUAGE_SUFFIX = '.i18nextLng';
    private static readonly CONFIG_PREFIX = '@chatic/config.';
    /** Written by both storages during OAuth, so it is cleared from both. */
    private static readonly OAUTH_PROVIDER_KEY = 'chatic-oauth-provider';

    sweep(): void {
        if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return;

        try {
            if (new URLSearchParams(window.location.search).get('logout') !== '1') return;

            // The same storage the entry point handed to `setStorageAdapter`: inside a native or
            // desktop shell the session lives in localStorage so it survives a WebView cache wipe.
            const storage = isNative() ? localStorage : sessionStorage;

            const doomed: string[] = [];
            for (let i = 0; i < storage.length; i++) {
                const key = storage.key(i);
                if (key && this.isSessionKey(key)) doomed.push(key);
            }
            // Collected first: removing during the walk shifts the indices under it.
            doomed.forEach(key => storage.removeItem(key));

            sessionStorage.removeItem(LogoutStorageSweeper.OAUTH_PROVIDER_KEY);
            localStorage.removeItem(LogoutStorageSweeper.OAUTH_PROVIDER_KEY);
        } catch {
            // Storage access throws in a few browser configurations. A missed sweep costs a stale
            // bundle that the next login overwrites anyway — never a failed boot.
        }
    }

    private isSessionKey(key: string): boolean {
        if (!key.startsWith(LogoutStorageSweeper.SESSION_PREFIX)) return false;
        if (key.startsWith(LogoutStorageSweeper.CONFIG_PREFIX)) return false;
        return !key.endsWith(LogoutStorageSweeper.LANGUAGE_SUFFIX);
    }
}

export const logoutStorageSweeper: ILogoutStorageSweeper = new LogoutStorageSweeper();
