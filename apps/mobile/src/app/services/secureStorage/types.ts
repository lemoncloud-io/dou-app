import type { OnStorageGetPayload, StorageUnavailableReason } from '@chatic/bridge-messages';

export interface ISecureStorageService {
    start(): void;

    get(): Promise<OnStorageGetPayload>;

    save(set: Record<string, string>, remove: readonly string[]): Promise<boolean>;

    clear(): Promise<boolean>;

    keyCount(): number | null;
}

export interface ISecureStorageInstallFlag {
    isSet(): boolean;
    set(): void;
}

export type ForegroundSubscriber = (onForeground: () => void) => () => void;

export type VaultState =
    | { kind: 'idle' }
    | { kind: 'available' }
    | { kind: 'unavailable'; reason: StorageUnavailableReason };
