import { BridgeStorageChannel, isNative, shellKeepsStorageMedium, webClient } from '@chatic/bridges';
import { NativeSecureMedium, TolerantMedium, WebMedium } from '@chatic/storage';

import type { KeyValueStore } from '@chatic/storage';

/**
 * What the choice of media depends on, read once at boot.
 *
 * - `inShell` — the page runs inside an app or desktop shell (`isNative()`).
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

/**
 * Every medium an app keeps state in, by the role it plays — the only names an entry point hands out.
 *
 * - `secret` · `plain` — the session's two ports.
 * - `vault` — the device vault behind `secret`, when there is one; the entry point loads it before the
 *   runtime boots. `null` when `secret` is a web medium.
 * - `device` · `tab` — everything else an app or the runtime keeps: values that outlive the tab, and
 *   values that do not. Tolerant, because none of it may break a screen.
 * - `webLocal` · `webSession` — the raw web media, for the few boot steps that move data between them
 *   (the vault migration reads both).
 */
export interface StorageMedia {
    secret: KeyValueStore;
    plain: KeyValueStore;
    vault: NativeSecureMedium | null;
    device: KeyValueStore;
    tab: KeyValueStore;
    webLocal: KeyValueStore;
    webSession: KeyValueStore;
}

/** The environment as this page sees it. */
export const readStorageEnvironment = (): StorageEnvironment => ({
    inShell: isNative(),
    shellKeepsVault: shellKeepsStorageMedium('nativeSecure'),
    lateVaultConfirmed: WebMedium.session().get(LATE_VAULT_MARK) === '1',
});

const createVault = (): NativeSecureMedium =>
    new NativeSecureMedium({
        channel: new BridgeStorageChannel(webClient, 'nativeSecure'),
        // Never localStorage: a run whose vault is unavailable keeps the session in the tab only.
        fallback: WebMedium.session(),
    });

/**
 * The one place an app's media are chosen and built — the storage counterpart of the cache's
 * `resolveCacheBackend`. An entry point that uses it calls it once and hands the result out instead of
 * constructing media itself (apps/web and apps/desktop-web do).
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
export const resolveStorageMedia = (
    env: StorageEnvironment = readStorageEnvironment(),
    vaultFactory: () => NativeSecureMedium = createVault
): StorageMedia => {
    const webLocal = WebMedium.local();
    const webSession = WebMedium.session();
    const plain = env.inShell ? webLocal : webSession;
    const vault = env.shellKeepsVault || env.lateVaultConfirmed ? vaultFactory() : null;
    return {
        secret: vault ?? plain,
        plain,
        vault,
        device: new TolerantMedium(webLocal),
        tab: new TolerantMedium(webSession),
        webLocal,
        webSession,
    };
};
