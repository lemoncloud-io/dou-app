/**
 * A JSON-encoded value in session storage, parsed at most once per distinct raw string.
 *
 * The stores read the same token several times per derivation — `buildRelayContext()` alone hit the
 * relay token three times (`isAuthenticated`, `identityToken`, and the uid seed), each a full
 * `JSON.parse`. Every read still goes to storage, so a write from anywhere (including code outside
 * this package) is picked up; the only thing reused is the PARSE of a raw string we have already
 * parsed. That makes the memo unobservable — it cannot answer with a value the storage no longer
 * holds, which a time- or event-based cache could.
 */
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
