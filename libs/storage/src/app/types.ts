/** The part of a DOM `Storage` the app-wide storage writes through. */
export interface StorageAdapter {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
}

/** What code outside a domain port reads and writes through. */
export interface IAppStorage {
    get(key: string): string | null;
    set(key: string, value: string): void;
    remove(key: string): void;
    /** Points every later call at `adapter`. Assignment, so a second call replaces the first. */
    use(adapter: StorageAdapter): void;
}
