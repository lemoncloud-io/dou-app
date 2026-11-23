import type { ImageCacheRecord, ImageCacheStore, ImageVariant } from './imageCache';

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
            if (gaveUp) request.result.close();
            else resolve(request.result);
        };
        request.onerror = () => reject(request.error);
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
        const tx = (await this.connect()).transaction([META, BLOBS], 'readwrite');
        const range = IDBKeyRange.bound([variant, -Infinity], [variant, Infinity]);
        const newestFirst = await promised<Meta[]>(tx.objectStore(META).index(BY_VARIANT_USED).getAll(range));
        newestFirst.reverse();
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
            opening.catch(() => {
                if (this.db === opening) this.db = null;
            });
            this.db = opening;
        }
        return this.db;
    }
}
