import type { OnStorageGetPayload } from '@chatic/bridge-messages';

/**
 * A storage medium the shell keeps, reached over the bridge. The same shape as `@chatic/storage`'s
 * `NativeStorageChannel`, written out so this lib needs no import of it.
 */
export interface IBridgeStorageChannel {
    read(): Promise<OnStorageGetPayload>;
    /** `true` only once the shell confirmed the writes are in the vault. */
    save(set: Record<string, string>, remove: string[]): Promise<boolean>;
    /** `true` only once the shell confirmed the vault is empty. */
    clear(): Promise<boolean>;
}

declare global {
    interface Window {
        /** The storage media this shell keeps for the web, injected before the page's scripts run. */
        CHATIC_APP_STORAGE_MEDIA?: unknown;
    }
}
