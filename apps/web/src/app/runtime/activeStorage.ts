import type { KeyValueStore } from '@chatic/storage';

export type ActiveVault = KeyValueStore & { readonly status: 'available' | 'unavailable' };

export interface ActiveStores {
    secret: KeyValueStore;
    plain: KeyValueStore;
    vault: ActiveVault | null;
    webLocal: KeyValueStore;
    webSession: KeyValueStore;
}

export interface ActivePortChoices {
    storage?: string;
    cache?: string;
    engine?: string;
}

export interface ActiveCacheRoute {
    type: string;
    route: string;
}

export type StorageMedium = 'vault' | 'localStorage' | 'sessionStorage';

export type StorageRole = 'secret' | 'plain' | 'device' | 'tab';

let stores: ActiveStores | null = null;
let choices: ActivePortChoices = {};
let cacheRoutes: readonly ActiveCacheRoute[] | null = null;

export const recordActiveStores = (next: ActiveStores): void => {
    stores = next;
};

export const recordPortChoices = (next: ActivePortChoices): void => {
    choices = { ...next };
};

export const recordCacheRoutes = (next: readonly ActiveCacheRoute[]): void => {
    cacheRoutes = next.map(({ type, route }) => ({ type, route }));
};

export const readActiveStores = (): ActiveStores | null => stores;
export const readPortChoices = (): ActivePortChoices => choices;
export const readCacheRoutes = (): readonly ActiveCacheRoute[] | null => cacheRoutes;

export const mediumOf = (store: KeyValueStore, active: ActiveStores): StorageMedium | null => {
    if (active.vault && store === active.vault) return 'vault';
    if (store === active.webLocal) return 'localStorage';
    if (store === active.webSession) return 'sessionStorage';
    return null;
};

export const describeStoreRoles = (active: ActiveStores): Record<StorageRole, StorageMedium | null> => ({
    secret: mediumOf(active.secret, active),
    plain: mediumOf(active.plain, active),
    device: 'localStorage',
    tab: 'sessionStorage',
});

export const resetActiveStorageForTests = (): void => {
    stores = null;
    choices = {};
    cacheRoutes = null;
};
