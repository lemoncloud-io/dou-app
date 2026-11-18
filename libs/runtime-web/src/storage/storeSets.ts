import { BridgeStorageChannel, webClient } from '@chatic/bridges';
import type { IWebBridgeClient } from '@chatic/bridges';
import { NativeSecureStore, TolerantStore, WebStore } from '@chatic/storage';
import type { KeyValueStore } from '@chatic/storage';

/**
 * Every store an app keeps state in, by the role it plays — the only names an entry point hands out.
 *
 * - `secret` · `plain` — the session's two ports.
 * - `vault` — the device vault behind `secret`, when there is one; the entry point loads it before the
 *   runtime boots. `null` when `secret` is a web store.
 * - `device` · `tab` — everything else an app or the runtime keeps: values that outlive the tab, and
 *   values that do not. Tolerant, because none of it may break a screen.
 * - `webLocal` · `webSession` — the raw web stores, for the few boot steps that move data between them
 *   (the vault migration reads both).
 */
export interface StorageStores {
    secret: KeyValueStore;
    plain: KeyValueStore;
    vault: NativeSecureStore | null;
    device: KeyValueStore;
    tab: KeyValueStore;
    webLocal: KeyValueStore;
    webSession: KeyValueStore;
}

/**
 * The page's two raw web stores, which every store set is made over: `localStorage` and the tab's
 * `sessionStorage`. Handed in, so a set is built from the same two objects the caller holds.
 */
export interface WebStorageAreas {
    webLocal: KeyValueStore;
    webSession: KeyValueStore;
}

/** The page's own `localStorage` and `sessionStorage`. */
export const pageStorageAreas = (): WebStorageAreas => ({ webLocal: WebStore.local(), webSession: WebStore.session() });

/**
 * The set around a choice of session stores. `device` is `localStorage` in every set — a draft or a
 * recent emoji has always outlived the tab, in a browser too — and `tab` is the tab's; both tolerant,
 * for the features' convenience state. A cache that must hear a failed write takes `webSession` instead.
 */
const storesAround = (
    { webLocal, webSession }: WebStorageAreas,
    session: { secret: KeyValueStore; plain: KeyValueStore; vault: NativeSecureStore | null }
): StorageStores => ({
    ...session,
    device: new TolerantStore(webLocal),
    tab: new TolerantStore(webSession),
    webLocal,
    webSession,
});

/**
 * A plain browser tab's stores (`storage.tab`): the whole session in the tab's `sessionStorage`, so it
 * ends with the tab like the sign-in does.
 */
export const tabStorageStores = (areas: WebStorageAreas): StorageStores =>
    storesAround(areas, { secret: areas.webSession, plain: areas.webSession, vault: null });

/**
 * A shell from before the vault (`storage.local`): the whole session in `localStorage`, because inside
 * a shell it must survive the WebView being relaunched.
 */
export const localStorageStores = (areas: WebStorageAreas): StorageStores =>
    storesAround(areas, { secret: areas.webLocal, plain: areas.webLocal, vault: null });

export interface VaultStorageOptions extends WebStorageAreas {
    /** The device vault the session's secrets go to; loaded by the entry point before the runtime boots. */
    vault: NativeSecureStore;
    /**
     * Where the session's plain state goes. `webLocal` — a shell's answer, the only place a vault
     * exists — unless the caller says otherwise.
     */
    plain?: KeyValueStore;
}

/** A shell with a vault (`storage.vault`): the secrets in the vault, the plain state beside them in `localStorage`. */
export const vaultStorageStores = ({ vault, plain, ...areas }: VaultStorageOptions): StorageStores =>
    storesAround(areas, { secret: vault, plain: plain ?? areas.webLocal, vault });

export interface ShellVaultOptions {
    /** The bridge the vault's requests go over; the page's own by default. */
    client?: IWebBridgeClient;
    /**
     * Where the vault keeps the session when the shell cannot. The tab's `sessionStorage` by default —
     * never `localStorage`: a run whose vault is unavailable keeps the session in the tab only.
     */
    fallback?: KeyValueStore;
}

/** The shell's device vault, reached across the page's bridge (`nativeSecure`). */
export const createShellVault = ({
    client = webClient,
    fallback = WebStore.session(),
}: ShellVaultOptions = {}): NativeSecureStore =>
    new NativeSecureStore({ channel: new BridgeStorageChannel(client, 'nativeSecure'), fallback });
