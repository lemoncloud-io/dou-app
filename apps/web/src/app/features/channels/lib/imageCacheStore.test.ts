/**
 * @jest-environment node
 *
 * jsdom has no structuredClone, which fake-indexeddb clones every value with; the store needs no DOM.
 */
import { IDBFactory } from 'fake-indexeddb';
// Also installs the IDBKeyRange global the store builds its eviction range with.
import 'fake-indexeddb/auto';

import type { ImageCacheRecord } from './imageCache';
import { IMAGE_CACHE_DB_NAME, IndexedDbImageCacheStore } from './imageCacheStore';

const record = (key: string, size: number, usedAt: number, variant: 'thumb' | 'org' = 'thumb'): ImageCacheRecord => ({
    key,
    variant,
    type: 'image/jpeg',
    bytes: new Uint8Array(size).fill(7).buffer,
    size,
    usedAt,
});

// A fresh factory per test, so no database outlives its test.
const fresh = (factory = new IDBFactory()) => new IndexedDbImageCacheStore(factory);

describe('IndexedDbImageCacheStore', () => {
    it('keeps a record and gives the bytes back', async () => {
        const store = fresh();
        await store.put(record('k', 4, 1));

        const kept = await store.get('k');

        expect(kept).toMatchObject({ key: 'k', variant: 'thumb', type: 'image/jpeg', size: 4, usedAt: 1 });
        expect(new Uint8Array(kept?.bytes as ArrayBuffer)).toEqual(new Uint8Array([7, 7, 7, 7]));
    });

    it('answers undefined for a key it never kept', async () => {
        expect(await fresh().get('missing')).toBeUndefined();
    });

    it('moves the last use of a kept record, and ignores a key it does not have', async () => {
        const store = fresh();
        await store.put(record('k', 1, 1));

        await store.touch('k', 50);
        await store.touch('missing', 50);

        expect((await store.get('k'))?.usedAt).toBe(50);
        expect(await store.get('missing')).toBeUndefined();
    });

    it('deletes a record', async () => {
        const store = fresh();
        await store.put(record('k', 1, 1));

        await store.delete('k');

        expect(await store.get('k')).toBeUndefined();
    });

    describe('trim', () => {
        it('drops the least recently used until the variant fits its budget', async () => {
            const store = fresh();
            await store.put(record('old', 10, 1));
            await store.put(record('mid', 10, 2));
            await store.put(record('new', 10, 3));

            await store.trim('thumb', 25);

            expect(await store.get('old')).toBeUndefined();
            expect(await store.get('mid')).toBeDefined();
            expect(await store.get('new')).toBeDefined();
        });

        // Originals are several megabytes; they must not push the thumbnails out.
        it('counts each variant against its own budget', async () => {
            const store = fresh();
            await store.put(record('thumb', 10, 1, 'thumb'));
            await store.put(record('org', 100, 2, 'org'));

            await store.trim('org', 50);

            expect(await store.get('org')).toBeUndefined();
            expect(await store.get('thumb')).toBeDefined();
        });

        it('leaves a variant under budget alone', async () => {
            const store = fresh();
            await store.put(record('a', 10, 1));

            await store.trim('thumb', 10);

            expect(await store.get('a')).toBeDefined();
        });
    });
    // Holding on would block the other page's upgrade until this one reloads.
    it('lets go of its connection when another page opens a newer version', async () => {
        const factory = new IDBFactory();
        const store = fresh(factory);
        await store.put(record('k', 1, 1));

        const upgraded = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = factory.open(IMAGE_CACHE_DB_NAME, 2);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('blocked'));
        });

        expect(upgraded.version).toBe(2);
        upgraded.close();
    });

    // Waiting on a blocked open would hold every image with it; failing lets the cache fetch instead.
    it('fails an open that another connection blocks, and opens again once it is free', async () => {
        const factory = new IDBFactory();
        // A newer version held by a connection that never steps aside.
        const holder = await new Promise<IDBDatabase>(resolve => {
            const request = factory.open(IMAGE_CACHE_DB_NAME, 1);
            request.onupgradeneeded = () => {
                request.result
                    .createObjectStore('meta', { keyPath: 'key' })
                    .createIndex('byVariantUsedAt', ['variant', 'usedAt']);
                request.result.createObjectStore('blobs', { keyPath: 'key' });
            };
            request.onsuccess = () => resolve(request.result);
        });
        const store = new IndexedDbImageCacheStore(factory, IMAGE_CACHE_DB_NAME, 2);

        await expect(store.get('k')).rejects.toThrow('blocked');

        holder.close();
        expect(await store.get('k')).toBeUndefined();
    });
});
