import type { OnStorageGetPayload, StorageUnavailableReason } from '@chatic/bridge-messages';

export interface SafeStorageLike {
    isEncryptionAvailable(): boolean;
    getSelectedStorageBackend(): string;
    encryptString(plainText: string): Buffer;
    decryptString(encrypted: Buffer): string;
}

export interface SecureStorageFs {
    readFile(path: string): Promise<Buffer>;
    writeFile(path: string, data: Buffer, options: { mode: number }): Promise<void>;
    rename(from: string, to: string): Promise<void>;
    rm(path: string, options: { force: true }): Promise<void>;
}

export interface SecureStorageDeps {
    safeStorage: SafeStorageLike;
    fs: SecureStorageFs;
    filePath: string;
    platform: string;
    logError?: (message: string, error?: unknown) => void;
}

export type SecureStorageSnapshot = OnStorageGetPayload;

export interface ISecureStorage {
    start(): Promise<void>;
    get(): Promise<SecureStorageSnapshot>;
    save(set: Record<string, string>, remove: readonly string[]): Promise<boolean>;
    clear(): Promise<boolean>;
}

export type VaultState =
    | { status: 'available'; values: Record<string, string>; reset: boolean }
    | { status: 'unavailable'; reason: StorageUnavailableReason };
