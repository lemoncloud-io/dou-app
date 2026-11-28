export interface IKeyValueStorage {
    set<T>(key: string, value: T): Promise<void>;
    get<T>(key: string): Promise<T | null>;
    setSync<T>(key: string, value: T): void;
    getSync<T>(key: string): T | null;
    remove(key: string): Promise<void>;
    clearAll(): Promise<void>;
    getAllKeys(): string[];
    getByteLength(key: string): number;
}
