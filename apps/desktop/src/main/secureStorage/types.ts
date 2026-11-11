import type { OnStorageGetPayload, StorageUnavailableReason } from '@chatic/bridge-messages';

/**
 * The slice of Electron's `safeStorage` the vault uses. Injected rather than imported so the vault
 * stays electron-free and runs under jest (see `webUrl.ts`).
 */
export interface SafeStorageLike {
    isEncryptionAvailable(): boolean;
    /** Linux only — Electron documents it for no other platform, so it is only called there. */
    getSelectedStorageBackend(): string;
    encryptString(plainText: string): Buffer;
    decryptString(encrypted: Buffer): string;
}

/** The slice of `node:fs/promises` the vault uses. */
export interface SecureStorageFs {
    readFile(path: string): Promise<Buffer>;
    writeFile(path: string, data: Buffer, options: { mode: number }): Promise<void>;
    rename(from: string, to: string): Promise<void>;
    rm(path: string, options: { force: true }): Promise<void>;
}

export interface SecureStorageDeps {
    safeStorage: SafeStorageLike;
    fs: SecureStorageFs;
    /** Absolute path of the vault file, normally `userData/secrets.bin`. */
    filePath: string;
    /** `process.platform`. */
    platform: string;
    /** Where read and write failures are reported. Defaults to `console.error`. */
    logError?: (message: string, error?: unknown) => void;
}

/** What the vault answers a `StorageGet` with — the bridge payload as is. */
export type SecureStorageSnapshot = OnStorageGetPayload;

/** The device vault, as the bridge handlers and the app's start-up use it. */
export interface ISecureStorage {
    /** Reads the vault into memory. Once, before the window exists; `get` waits for it. */
    start(): Promise<void>;
    get(): Promise<SecureStorageSnapshot>;
    /** `true` only once the writes are on disk. */
    save(set: Record<string, string>, remove: readonly string[]): Promise<boolean>;
    /** `true` only once the vault file is gone. */
    clear(): Promise<boolean>;
}

/** What the vault holds this run: its values, or why it cannot be used. */
export type VaultState =
    | { status: 'available'; values: Record<string, string>; reset: boolean }
    | { status: 'unavailable'; reason: StorageUnavailableReason };
