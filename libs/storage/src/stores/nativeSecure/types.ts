import type { KeyValueStore } from '../types';

/** What the shell answered when asked for the vault's values. */
export interface NativeReadResult {
    status: 'available' | 'unavailable';
    /** Why, when `unavailable`. `error` also covers a shell that did not answer in time. */
    reason?: 'locked' | 'undecryptable' | 'error';
    /** The vault could not be decrypted, so the shell emptied it. */
    reset?: true;
    values: Record<string, string>;
}

/**
 * How the store reaches the shell. The app's entry point builds one over the bridge; this package
 * imports no bridge, so a test hands it a fake.
 */
export interface NativeStorageChannel {
    read(): Promise<NativeReadResult>;
    /** Resolves `true` only once the writes are in the vault. */
    save(set: Record<string, string>, remove: string[]): Promise<boolean>;
    /** Resolves `true` only once the vault is empty. */
    clear(): Promise<boolean>;
}

/** A store the shell keeps. Loaded once per page, then read from memory. */
export interface NativeStore extends KeyValueStore {
    /** `unavailable` once a read or a write failed this run; reads and writes then go to the fallback. */
    readonly status: 'available' | 'unavailable';
    /**
     * Loads the vault into memory. Once per page, before anything reads the store. Never rejects:
     * a failure or a timeout answers `unavailable`, which is not the same as empty.
     */
    hydrate(): Promise<NativeReadResult>;
    /** Sends what is waiting now and resolves once the shell confirmed it; rejects when it did not. */
    flush(): Promise<void>;
}

export interface NativeSecureStoreOptions {
    channel: NativeStorageChannel;
    /** Where values go once the vault is unavailable this run — `webSession`, never `localStorage`. */
    fallback: KeyValueStore;
    /**
     * A limit of the store's own on any one answer. Left out, the channel's timeout is the only one —
     * the bridge's holds while the page is hidden, which a plain timer here would not.
     */
    timeoutMs?: number;
}
