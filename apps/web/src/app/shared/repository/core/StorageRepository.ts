export const isNativeApp = (): boolean => {
    return typeof window !== 'undefined' && window.ReactNativeWebView !== undefined;
};

export interface StorageRepository<T> {
    save(id: string, item: T): Promise<void>;

    saveAll(items: T[]): Promise<void>;

    load(id: string): Promise<T | null>;

    loadAll(query?: any): Promise<T[]>;

    delete(id: string): Promise<void>;

    deleteAll(ids: string[]): Promise<void>;
}
