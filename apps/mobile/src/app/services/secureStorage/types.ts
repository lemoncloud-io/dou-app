import type { OnStorageGetPayload, StorageUnavailableReason } from '@chatic/bridge-messages';

/**
 * The device vault the shell keeps for the web — the `nativeSecure` storage medium. One keychain item
 * (iOS Keychain, Android Keystore-encrypted prefs) holds every key as one JSON object; this service
 * keeps a copy in memory and answers the web's StorageGet / StorageSave / StorageClear from it.
 */
export interface ISecureStorageService {
    /**
     * Starts the one read at app start and listens for the app returning to the foreground, where a
     * vault that was locked is read again. Idempotent; called by the provider before the WebView
     * mounts.
     */
    start(): void;

    /**
     * Every value, or why the vault cannot be used this run. Waits for a read that is still running;
     * a vault that was locked or failed to read is read again first.
     */
    get(): Promise<OnStorageGetPayload>;

    /**
     * Applies `set` and `remove` and writes the whole vault. `true` only once the keychain write has
     * resolved; `false` leaves the vault unavailable for the rest of the run. Writes run one at a
     * time, in the order they were asked for.
     */
    save(set: Record<string, string>, remove: readonly string[]): Promise<boolean>;

    /** Deletes the keychain item and empties the copy in memory. `true` only once the delete resolved. */
    clear(): Promise<boolean>;

    /** How many keys the vault holds, or `null` while it is unavailable. For the debug panel: never values. */
    keyCount(): number | null;
}

/**
 * Whether this install has already set up the vault. Kept outside the keychain on purpose: iOS keeps
 * keychain items across an uninstall, and app storage is what an uninstall does remove — so a missing
 * flag next to an existing item means the item belongs to an earlier install.
 */
export interface ISecureStorageInstallFlag {
    isSet(): boolean;
    set(): void;
}

/** Subscribes to the app becoming active again; returns the unsubscribe. */
export type ForegroundSubscriber = (onForeground: () => void) => () => void;

/** Where the vault stands this run: not read yet, readable, or why it cannot be used. */
export type VaultState =
    | { kind: 'idle' }
    | { kind: 'available' }
    | { kind: 'unavailable'; reason: StorageUnavailableReason };
