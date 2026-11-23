export type StoreName = 'webLocal' | 'webSession' | 'memory' | 'nativeSecure';

export interface KeyValueStore {
    get(key: string): string | null;
    set(key: string, value: string): void;
    remove(key: string): void;
    clear(): void;
    keys(): string[];
}
