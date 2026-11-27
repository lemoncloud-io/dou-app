import { AppState } from 'react-native';

import { MemoryStore, NativeSecureStore } from '@chatic/storage';
import type { KeyValueStore, NativeReadResult, NativeStore } from '@chatic/storage';

import type { AppStateSource } from './foreground';

export interface KeyValueFile {
    getString(key: string): string | undefined;
    set(key: string, value: string): void;
    remove(key: string): boolean;
    clearAll(): void;
    getAllKeys(): string[];
}

export const keyValueStoreOn = (file: KeyValueFile): KeyValueStore => ({
    get: key => file.getString(key) ?? null,
    set: (key, value) => file.set(key, value),
    remove: key => {
        file.remove(key);
    },
    clear: () => file.clearAll(),
    keys: () => file.getAllKeys(),
});

export interface DeviceVault {
    get(): Promise<NativeReadResult>;
    save(set: Record<string, string>, remove: readonly string[]): Promise<boolean>;
    clear(): Promise<boolean>;
}

export const NATIVE_VAULT_TIMEOUT_MS = 10_000;

export interface NativeSecretStoreOptions {
    fallback?: KeyValueStore;
    timeoutMs?: number;
}

export const nativeSecretStore = (
    vault: DeviceVault,
    { fallback = new MemoryStore(), timeoutMs = NATIVE_VAULT_TIMEOUT_MS }: NativeSecretStoreOptions = {}
): NativeStore =>
    new NativeSecureStore({
        channel: {
            read: () => vault.get(),
            save: (set, remove) => vault.save(set, remove),
            clear: () => vault.clear(),
        },
        fallback,
        timeoutMs,
    });

export interface NativeStoragePorts {
    secret: NativeStore;
    plain: KeyValueStore;
    device: KeyValueStore;
    tab: KeyValueStore;
}

export interface NativeStorageOptions {
    vault: DeviceVault;
    files: { plain: KeyValueFile; device: KeyValueFile };
    secret?: NativeSecretStoreOptions;
}

export const nativeStoragePorts = ({ vault, files, secret }: NativeStorageOptions): NativeStoragePorts => ({
    secret: nativeSecretStore(vault, secret),
    plain: keyValueStoreOn(files.plain),
    device: keyValueStoreOn(files.device),
    tab: new MemoryStore(),
});

const LOCKED_IN_FRONT_RETRY_MS = 1000;

const nextChanceToRead = (appState: AppStateSource, retryInFront: boolean): Promise<void> =>
    new Promise(resolve => {
        if (retryInFront && appState.currentState === 'active') {
            setTimeout(resolve, LOCKED_IN_FRONT_RETRY_MS);
            return;
        }
        const subscription = appState.addEventListener('change', state => {
            if (state !== 'active') return;
            subscription.remove();
            resolve();
        });
    });

export const waitForUnlockedVault = async (
    vault: Pick<DeviceVault, 'get'>,
    appState: AppStateSource = AppState
): Promise<NativeReadResult> => {
    let retriedInFront = false;
    for (;;) {
        const read = await vault.get();
        if (read.status !== 'unavailable' || read.reason !== 'locked') return read;
        const retryInFront: boolean = !retriedInFront && appState.currentState === 'active';
        retriedInFront ||= retryInFront;
        await nextChanceToRead(appState, retryInFront);
    }
};
