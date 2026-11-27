import { TolerantStore, WebStore } from '@chatic/storage';
import type { KeyValueStore, NativeSecureStore } from '@chatic/storage';

export interface StorageStores {
    secret: KeyValueStore;
    plain: KeyValueStore;
    vault: NativeSecureStore | null;
    device: KeyValueStore;
    tab: KeyValueStore;
    webLocal: KeyValueStore;
    webSession: KeyValueStore;
}

export interface WebStorageAreas {
    webLocal: KeyValueStore;
    webSession: KeyValueStore;
}

export const pageStorageAreas = (): WebStorageAreas => ({ webLocal: WebStore.local(), webSession: WebStore.session() });

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

export const tabStorageStores = (areas: WebStorageAreas): StorageStores =>
    storesAround(areas, { secret: areas.webSession, plain: areas.webSession, vault: null });

export const localStorageStores = (areas: WebStorageAreas): StorageStores =>
    storesAround(areas, { secret: areas.webLocal, plain: areas.webLocal, vault: null });

export interface VaultStorageOptions extends WebStorageAreas {
    vault: NativeSecureStore;
    plain?: KeyValueStore;
}

export const vaultStorageStores = ({ vault, plain, ...areas }: VaultStorageOptions): StorageStores =>
    storesAround(areas, { secret: vault, plain: plain ?? areas.webLocal, vault });
