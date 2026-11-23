import type { KeyValueStore } from '../types';

export interface NativeReadResult {
    status: 'available' | 'unavailable';
    reason?: 'locked' | 'undecryptable' | 'error';
    reset?: true;
    values: Record<string, string>;
}

export interface NativeStorageChannel {
    read(): Promise<NativeReadResult>;
    save(set: Record<string, string>, remove: string[]): Promise<boolean>;
    clear(): Promise<boolean>;
}

export interface NativeStore extends KeyValueStore {
    readonly status: 'available' | 'unavailable';
    hydrate(): Promise<NativeReadResult>;
    flush(): Promise<void>;
    offer(key: string, value: string): Promise<boolean>;
}

export interface NativeSecureStoreOptions {
    channel: NativeStorageChannel;
    fallback: KeyValueStore;
    timeoutMs?: number;
}
