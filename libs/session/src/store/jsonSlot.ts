export interface StorageLike {
    get(key: string): string | null;
    set(key: string, value: string): void;
    remove(key: string): void;
}

export class JsonSlot<T> {
    private memo: { raw: string; value: T } | null = null;

    constructor(
        private readonly storage: StorageLike,
        private readonly key: string
    ) {}

    read(): T | null {
        const raw = this.storage.get(this.key);
        if (!raw) {
            this.memo = null;
            return null;
        }
        if (this.memo && this.memo.raw === raw) {
            return this.memo.value;
        }
        const value = JSON.parse(raw) as T;
        this.memo = { raw, value };
        return value;
    }

    write(value: T): void {
        this.storage.set(this.key, JSON.stringify(value));
    }

    clear(): void {
        this.storage.remove(this.key);
        this.memo = null;
    }
}
