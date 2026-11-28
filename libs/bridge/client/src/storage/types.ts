import type { OnStorageGetPayload } from '@chatic/bridge-messages';

export interface IBridgeStorageChannel {
    read(): Promise<OnStorageGetPayload>;
    save(set: Record<string, string>, remove: string[]): Promise<boolean>;
    clear(): Promise<boolean>;
}

declare global {
    interface Window {
        CHATIC_APP_STORAGE_MEDIA?: unknown;
    }
}
