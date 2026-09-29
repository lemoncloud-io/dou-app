import type { ImageCacheRecord, ImageCacheStore, ImageVariant } from './imageCache';

/**
 * `ImageCacheStore` over IndexedDB, in a database of its own.
 *
 * Not in `ChaticWebCacheDB`: that one is `libs/db`'s, versioned with the chat model, and an image blob
 * store has nothing to migrate with it. Dropping this database loses nothing but downloads.
 *
 * Two stores, so eviction never reads a byte of image: `meta` holds what the LRU needs (size, last
 * use, variant) and is walked in use order through its index; `blobs` holds the bytes and is read
 * only on a hit.
 */
export const IMAGE_CACHE_DB_NAME = 'ChaticImageCacheDB';
const DB_VERSION = 1;
const META = 'meta';
const BLOBS = 'blobs';
const BY_VARIANT_USED = 'byVariantUsedAt';

type Meta = Omit<ImageCacheRecord, 'bytes' | 'type'>;
interface BlobRow {
    key: string;
    type: string;
    bytes: ArrayBuffer;
}

const promised = <T>(request: IDBRequest<T>): Promise<T> =>
    new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

const done = (transaction: IDBTransaction): Promise<void> =>
    new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
    });

const open = (factory: IDBFactory, name: string, version: number): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
        const request = factory.open(name, version);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(META)) {
                db.createObjectStore(META, { keyPath: 'key' }).createIndex(BY_VARIANT_USED, ['variant', 'usedAt']);
            }
            if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS, { keyPath: 'key' });
        };
        let gaveUp = false;
        request.onsuccess = () => {
            // A blocked open still completes once the other connection goes; nobody is waiting for it.
            if (gaveUp) request.result.close();
            else resolve(request.result);
        };
        request.onerror = () => reject(request.error);
        // Another page holds an older version open. Waiting would hold every image with it; a rejected
        // open is a miss, and the next call tries again.
        request.onblocked = () => {
            gaveUp = true;
            reject(new Error('image cache database open is blocked'));
        };
    });

export class IndexedDbImageCacheStore implements ImageCacheStore {
    private db: Promise<IDBDatabase> | null = null;

    constructor(
        private readonly factory: IDBFactory,
        private readonly name: string = IMAGE_CACHE_DB_NAME,
        private readonly version: number = DB_VERSION
    ) {}

    async get(key: string): Promise<ImageCacheRecord | undefined> {
        const tx = (await this.connect()).transaction([META, BLOBS], 'readonly');
        const [meta, blob] = await Promise.all([
            promised<Meta | undefined>(tx.objectStore(META).get(key)),
            promised<BlobRow | undefined>(tx.objectStore(BLOBS).get(key)),
        ]);
        // Half a record — a write torn by a crash — is a miss, not an image.
        if (!meta || !blob) return undefined;
        return { ...meta, type: blob.type, bytes: blob.bytes };
    }

    async put({ bytes, type, ...meta }: ImageCacheRecord): Promise<void> {
        const tx = (await this.connect()).transaction([META, BLOBS], 'readwrite');
        tx.objectStore(META).put(meta);
        tx.objectStore(BLOBS).put({ key: meta.key, type, bytes } satisfies BlobRow);
        await done(tx);
    }

    async touch(key: string, usedAt: number): Promise<void> {
        const tx = (await this.connect()).transaction(META, 'readwrite');
        const store = tx.objectStore(META);
        const meta = await promised<Meta | undefined>(store.get(key));
        if (meta) store.put({ ...meta, usedAt });
        await done(tx);
    }

    async delete(key: string): Promise<void> {
        const tx = (await this.connect()).transaction([META, BLOBS], 'readwrite');
        tx.objectStore(META).delete(key);
        tx.objectStore(BLOBS).delete(key);
        await done(tx);
    }

    async trim(variant: ImageVariant, maxBytes: number): Promise<void> {
        // One transaction, so a record put or touched while this runs is not deleted on a stale order.
        const tx = (await this.connect()).transaction([META, BLOBS], 'readwrite');
        const range = IDBKeyRange.bound([variant, -Infinity], [variant, Infinity]);
        const newestFirst = await promised<Meta[]>(tx.objectStore(META).index(BY_VARIANT_USED).getAll(range));
        newestFirst.reverse();
        // Newest first: everything past the point where the running total leaves the budget goes.
        let total = 0;
        for (const meta of newestFirst) {
            total += meta.size;
            if (total <= maxBytes) continue;
            tx.objectStore(META).delete(meta.key);
            tx.objectStore(BLOBS).delete(meta.key);
        }
        await done(tx);
    }

    private connect(): Promise<IDBDatabase> {
        if (!this.db) {
            const opening = open(this.factory, this.name, this.version).then(db => {
                // A newer version elsewhere, or the browser closing the connection under storage
                // pressure: let go of it, so the next call opens a live one instead of failing forever.
                const forget = () => {
                    if (this.db === opening) this.db = null;
                };
                db.onversionchange = () => {
                    db.close();
                    forget();
                };
                db.onclose = forget;
                return db;
            });
            // A failed open is retried on the next call rather than remembered for the page's life.
            opening.catch(() => {
                if (this.db === opening) this.db = null;
            });
            this.db = opening;
        }
        return this.db;
    }
}
