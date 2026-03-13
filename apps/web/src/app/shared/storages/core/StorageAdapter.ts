export interface StorageAdapter<T> {
    save(id: string, item: T): Promise<void>;
    saveAll(items: T[]): Promise<void>;
    load(id: string): Promise<T | null>;
    loadAll(query?: any): Promise<T[]>;
    delete(id: string): Promise<void>;
    deleteAll(ids: string[]): Promise<void>;
}
