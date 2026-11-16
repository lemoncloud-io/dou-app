import { AppState } from 'react-native';

import { MemoryStore, NativeSecureStore } from '@chatic/storage';
import type { KeyValueStore, NativeReadResult, NativeStore } from '@chatic/storage';

import type { AppStateSource } from './foreground';

/**
 * A key-value file on the device — the part of MMKV's instance a store uses. Typed here rather than
 * imported, so this package carries no native module of its own; the app opens the file.
 */
export interface KeyValueFile {
    getString(key: string): string | undefined;
    set(key: string, value: string): void;
    remove(key: string): boolean;
    clearAll(): void;
    getAllKeys(): string[];
}

/**
 * A runtime store on a key-value file, the values as they are: a store is handed strings and gives
 * the same strings back, so nothing here encodes them (the app's own MMKV wrapper JSON-encodes, which
 * is why the runtime's files do not go through it).
 *
 * The file is the store's alone: `clear` empties all of it, as the `KeyValueStore` contract says, so
 * the app opens one file per store and never hands the runtime one it writes itself.
 */
export const keyValueStoreOn = (file: KeyValueFile): KeyValueStore => ({
    get: key => file.getString(key) ?? null,
    set: (key, value) => file.set(key, value),
    remove: key => {
        file.remove(key);
    },
    clear: () => file.clearAll(),
    keys: () => file.getAllKeys(),
});

/**
 * The device vault as the app keeps it — the same item the WebView's pages keep their secrets in
 * through `StorageGet`, `StorageSave` and `StorageClear`.
 */
export interface DeviceVault {
    get(): Promise<NativeReadResult>;
    /** Resolves `true` only once the writes are in the vault. */
    save(set: Record<string, string>, remove: readonly string[]): Promise<boolean>;
    /** Resolves `true` only once the vault is empty. */
    clear(): Promise<boolean>;
}

/** How long the vault may take to answer one read or write before the store stops relying on it. */
export const NATIVE_VAULT_TIMEOUT_MS = 10_000;

export interface NativeSecretStoreOptions {
    /** Where the session goes for the rest of the run once the vault fails. Memory by default. */
    fallback?: KeyValueStore;
    /** The limit on any one answer from the vault. */
    timeoutMs?: number;
}

/**
 * The session's `secret` store on the device vault: the store a page builds over the bridge, here over
 * the vault in this process. Values are held in memory once loaded, so reads are synchronous, and
 * writes reach the vault after, in the order they were made.
 *
 * It is the page's own store, so it keeps the page's rules: a vault that cannot be read or refuses a
 * write is not taken for an empty one — the store holds the session in `fallback` (memory by default,
 * gone with the process, as a page's tab storage is) for the rest of the run. An answer that does not
 * come within `timeoutMs` counts as such a failure, as the page's bridge timeout makes it there: a
 * keychain call that never returns must not hold the boot. It is not loaded here; the boot loads it,
 * through the same secret-storage step a page's boot runs, which also finishes a logout whose clear
 * was never confirmed.
 */
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

/** How long a read that answered locked while the app is in front waits before it asks once more. */
const LOCKED_IN_FRONT_RETRY_MS = 1000;

/**
 * The next moment worth asking the vault again: the app's next return to the front — or, once, when
 * the app is already in front (the phone was unlocked between the read and now), a short while from
 * now. Only once: a vault that still answers locked with the app in front will not change by being
 * asked every second, and each ask is a keychain read and a log line.
 */
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

/**
 * Waits until the vault can be read, and answers what it read.
 *
 * On iOS the vault is locked until the phone is first unlocked after it boots, and the app can be
 * launched before that, in the background. A page reads that as unavailable and runs signed in from
 * its tab until it reloads; a runtime in the app has no reload to come back with, and nothing to show
 * before the person unlocks the phone. So it waits, and asks again each time the app comes to the
 * front (and once more shortly after, if it read locked while already in front). Every other answer —
 * values, empty, an error — is returned at once.
 */
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
