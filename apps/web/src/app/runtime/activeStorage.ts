import type { KeyValueStore } from '@chatic/storage';

/**
 * Which stores and adapters this run actually uses, recorded by the entry point and the cache adapter
 * as they choose them, for the debug panel's Storage and DB screens to show.
 *
 * Nothing else keeps these choices: `startRuntime` only logs them (`app.runtime_port`), and the stores
 * `resolveStorageStores()` built are handed straight to config, the features and the runtime. A screen
 * that worked them out again would answer for the environment it re-read, not for the run that is
 * going on, so the choices are kept as they were made — the very store objects included, which is
 * what lets an edit on the screen land where the app reads.
 */

/** The device vault as the page holds it: a key-value store plus whether the shell could read it this run. */
export type ActiveVault = KeyValueStore & { readonly status: 'available' | 'unavailable' };

/** The store set `resolveStorageStores()` returned, as far as the screens need it. */
export interface ActiveStores {
    secret: KeyValueStore;
    plain: KeyValueStore;
    vault: ActiveVault | null;
    webLocal: KeyValueStore;
    webSession: KeyValueStore;
}

/** The adapter id each port was settled on, as `startRuntime` answered. */
export interface ActivePortChoices {
    storage?: string;
    cache?: string;
    engine?: string;
}

/** One cache domain and the store the assembly put it in (`web`, `native`, `session`). */
export interface ActiveCacheRoute {
    type: string;
    route: string;
}

/** A physical key-value medium a run can keep session state in. */
export type StorageMedium = 'vault' | 'localStorage' | 'sessionStorage';

/** The roles a store plays, in the order the screen lists them. */
export type StorageRole = 'secret' | 'plain' | 'device' | 'tab';

let stores: ActiveStores | null = null;
let choices: ActivePortChoices = {};
let cacheRoutes: readonly ActiveCacheRoute[] | null = null;

/** Called once from `main.tsx` with the stores it resolved, before the runtime starts. */
export const recordActiveStores = (next: ActiveStores): void => {
    stores = next;
};

/** Called once the runtime has started, with the adapter ids it settled on. */
export const recordPortChoices = (next: ActivePortChoices): void => {
    choices = { ...next };
};

/**
 * Called by the cache adapter with the routes the data assembly reported. The assembly asks once per
 * domain and keeps the answer for the session, so this is the decision the rows actually follow — a
 * fresh `route()` call now could answer differently (the shell's report can land after the assembly).
 * Each assembly replaces the last one's routes.
 */
export const recordCacheRoutes = (next: readonly ActiveCacheRoute[]): void => {
    cacheRoutes = next.map(({ type, route }) => ({ type, route }));
};

export const readActiveStores = (): ActiveStores | null => stores;
export const readPortChoices = (): ActivePortChoices => choices;
/** `null` until a page-side cache was assembled — and for the whole run when the shell owns the session. */
export const readCacheRoutes = (): readonly ActiveCacheRoute[] | null => cacheRoutes;

/** The medium behind a store of the set, by identity: the set hands out the very objects it built. */
export const mediumOf = (store: KeyValueStore, active: ActiveStores): StorageMedium | null => {
    if (active.vault && store === active.vault) return 'vault';
    if (store === active.webLocal) return 'localStorage';
    if (store === active.webSession) return 'sessionStorage';
    return null;
};

/**
 * Which roles each medium plays this run. `device` is always `localStorage` and `tab` always
 * `sessionStorage` (see `resolveStorageStores`); `secret` and `plain` follow the store set.
 */
export const describeStoreRoles = (active: ActiveStores): Record<StorageRole, StorageMedium | null> => ({
    secret: mediumOf(active.secret, active),
    plain: mediumOf(active.plain, active),
    device: 'localStorage',
    tab: 'sessionStorage',
});

/** Tests only. */
export const resetActiveStorageForTests = (): void => {
    stores = null;
    choices = {};
    cacheRoutes = null;
};
