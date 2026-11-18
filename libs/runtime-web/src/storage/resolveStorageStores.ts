import { hostProfile, shellKeepsStorageMedium } from '@chatic/bridges';
import { WebStore } from '@chatic/storage';
import type { NativeSecureStore } from '@chatic/storage';

import {
    createShellVault,
    localStorageStores,
    pageStorageAreas,
    tabStorageStores,
    vaultStorageStores,
} from './storeSets';
import type { StorageStores } from './storeSets';

export type { StorageStores } from './storeSets';

/**
 * What the choice of stores depends on, read once at boot.
 *
 * - `inShell` — the page runs inside an app or desktop shell: the host profile found a bridge channel.
 * - `shellKeepsVault` — the shell listed `nativeSecure` in what it injected before the page ran. This,
 *   not `inShell`, is what says the session's secrets go to the device vault: every shell answers
 *   `isNative()`, vault or not.
 * - `lateVaultConfirmed` — an earlier load of this tab learned from the handshake that the shell keeps
 *   a vault although the injection had not said so, marked the tab and reloaded. Only `apps/web`
 *   writes that mark; in any other app it is simply never set.
 */
export interface StorageEnvironment {
    inShell: boolean;
    shellKeepsVault: boolean;
    lateVaultConfirmed: boolean;
}

/** The tab mark a late vault leaves before the reload. Read here; written by the app that noticed. */
export const LATE_VAULT_MARK = 'chatic-shell-vault-confirmed';

/** The environment as this page sees it. */
export const readStorageEnvironment = (): StorageEnvironment => ({
    inShell: hostProfile().bridge !== null,
    shellKeepsVault: shellKeepsStorageMedium('nativeSecure'),
    lateVaultConfirmed: WebStore.session().get(LATE_VAULT_MARK) === '1',
});

/**
 * The one place an app's stores are chosen and built — the storage counterpart of the web cache's
 * `resolveCacheBackendFor`. An entry point that uses it calls it once and hands the result out instead of
 * constructing stores itself (apps/web and apps/desktop-web do). It reads the environment and picks
 * one of the three store sets in `storeSets.ts`, each of which builds on its own from what it is handed.
 *
 * The rule, by environment:
 *
 * | environment                    | secret        | plain       | device   | tab        |
 * | ------------------------------ | ------------- | ----------- | -------- | ---------- |
 * | shell with a vault             | vault         | webLocal    | webLocal | webSession |
 * | shell from before the vault    | webLocal      | webLocal    | webLocal | webSession |
 * | plain browser tab              | webSession    | webSession  | webLocal | webSession |
 *
 * Plain state follows the session: inside a shell it must survive the WebView being relaunched, in a
 * browser it ends with the tab like the sign-in does. `device` is `localStorage` everywhere — a draft
 * or a recent emoji has always outlived the tab, in a browser too. `device` and `tab` are tolerant, for
 * the features' convenience state; a cache that must hear a failed write takes `webSession` instead.
 */
export const resolveStorageStores = (
    env: StorageEnvironment = readStorageEnvironment(),
    vaultFactory: () => NativeSecureStore = createShellVault
): StorageStores => {
    const areas = pageStorageAreas();
    if (env.shellKeepsVault || env.lateVaultConfirmed) {
        // The vault follows the flags alone, as it always has; plain state still follows the shell
        // test, so a page that carries a vault flag outside a shell keeps its plain state in the tab.
        return vaultStorageStores({
            ...areas,
            vault: vaultFactory(),
            plain: env.inShell ? areas.webLocal : areas.webSession,
        });
    }
    return env.inShell ? localStorageStores(areas) : tabStorageStores(areas);
};
