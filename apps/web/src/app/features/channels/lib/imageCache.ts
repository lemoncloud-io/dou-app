/**
 * Chat images kept by what they are rather than by where they were fetched from.
 *
 * A chat image's address is a signed S3 URL, and the signature changes from one read of the message
 * to the next — the signing credential differs between reads even when the signing time is the same.
 * The browser caches by the full URL, so every read made every image a new download: a room opened
 * from the cache drew its images, the background re-read then handed the same images new addresses,
 * and all of them were fetched again. An upload's bytes never change, so this cache keys them by
 * cloud + upload id + variant and keeps them across addresses, reloads and expiry.
 *
 * Two layers: object URLs in memory for what this page has already drawn, and the bytes in a
 * persistent store for the next launch. A miss in both is one `fetch` of the signed address. When that
 * fetch cannot be made — no CORS on the bucket, offline, an expired address — `load` answers `null`
 * and the caller draws the signed address directly, as it did before this cache. A failed fetch still
 * costs that image its wait, so after one that got no answer at all, loads stop fetching for a minute.
 */

export type ImageVariant = 'thumb' | 'org';

export interface ImageCacheRecord {
    key: string;
    variant: ImageVariant;
    /** The response's content type, so the blob rebuilt from `bytes` decodes as what it was. */
    type: string;
    /** An ArrayBuffer rather than a Blob: older WebKit could not keep Blobs in IndexedDB. */
    bytes: ArrayBuffer;
    size: number;
    usedAt: number;
}

/** Where the bytes live between launches. Every method may reject; the cache treats that as a miss. */
export interface ImageCacheStore {
    get(key: string): Promise<ImageCacheRecord | undefined>;
    put(record: ImageCacheRecord): Promise<void>;
    touch(key: string, usedAt: number): Promise<void>;
    delete(key: string): Promise<void>;
    /** Drops the least recently used records of `variant` until they add up to at most `maxBytes`. */
    trim(variant: ImageVariant, maxBytes: number): Promise<void>;
}

export interface ImageCacheDeps {
    /** `null` where no persistent store can be opened; the memory layer still works. */
    store: ImageCacheStore | null;
    fetch: (url: string) => Promise<Response>;
    createObjectURL: (blob: Blob) => string;
    revokeObjectURL: (url: string) => void;
    now?: () => number;
    /** Persistent budget per variant, in bytes. */
    budgets?: Record<ImageVariant, number>;
    /** How many bytes of object URLs no one is drawing may stay in memory. */
    memoryMaxBytes?: number;
}

/**
 * About a thousand thumbnails (they land at 30–50KB), and a few dozen originals: an original is
 * uploaded as picked, so a single one can be several megabytes, and a separate budget keeps a handful
 * of opened photos from pushing every thumbnail out.
 */
export const DEFAULT_IMAGE_CACHE_BUDGETS: Record<ImageVariant, number> = {
    thumb: 50 * 1024 * 1024,
    org: 150 * 1024 * 1024,
};
const DEFAULT_MEMORY_MAX_BYTES = 40 * 1024 * 1024;
/**
 * A hit only moves the record's `usedAt` when the last move is older than this. The order only has to
 * be right to the hour for eviction, and a write per drawn tile would cost more than the read saved.
 */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;
/** Puts close together share one trim. */
const TRIM_DELAY_MS = 2000;
/**
 * How long a released image stays before memory is swept. A redraw releases the old requests and
 * retains the new ones in the same commit, and a render reads `peek` a frame before its effect
 * retains; revoking on release would pull the object URL out from under an `<img>` in either gap.
 */
const SWEEP_DELAY_MS = 1000;
/**
 * A store read slower than this is a miss. An IndexedDB open can hang — held by another connection,
 * or a WebKit that never answers — and every image would wait on it as a blank tile.
 */
const STORE_READ_TIMEOUT_MS = 1000;
/**
 * After a fetch that could not be made at all (no CORS on the bucket, offline), loads skip the fetch
 * for this long and draw the signed address directly: a fetch that is going to fail anyway only delays
 * the `<img>` that will load the same address.
 */
const FETCH_BACKOFF_MS = 60 * 1000;

export const imageCacheKey = (cid: string, uploadId: string, variant: ImageVariant): string =>
    `${cid}/${uploadId}/${variant}`;

interface MemoryEntry {
    url: string;
    size: number;
    usedAt: number;
}

export class ImageCache {
    private readonly memory = new Map<string, MemoryEntry>();
    private readonly inflight = new Map<string, { url: string; loading: Promise<string | null> }>();
    // Kept apart from `memory` so an entry can come and go — loaded late, invalidated — without
    // losing count of who is drawing it.
    private readonly refs = new Map<string, number>();
    // Object URLs taken out of `memory` while something may still draw them, revoked at the next sweep.
    private readonly retired: string[] = [];
    private readonly listeners = new Set<() => void>();
    private readonly pendingTrims = new Set<ImageVariant>();
    private trimTimer: ReturnType<typeof setTimeout> | null = null;
    private sweepTimer: ReturnType<typeof setTimeout> | null = null;
    private fetchBlockedUntil = 0;
    private readonly now: () => number;
    private readonly budgets: Record<ImageVariant, number>;
    private readonly memoryMaxBytes: number;

    constructor(private readonly deps: ImageCacheDeps) {
        this.now = deps.now ?? Date.now;
        this.budgets = deps.budgets ?? DEFAULT_IMAGE_CACHE_BUDGETS;
        this.memoryMaxBytes = deps.memoryMaxBytes ?? DEFAULT_MEMORY_MAX_BYTES;
    }

    /** The object URL already in memory for `key`, without waiting — what lets a redraw skip a frame. */
    peek(key: string): string | undefined {
        return this.memory.get(key)?.url;
    }

    /**
     * Marks `key` as drawn. A retained object URL is never revoked, so an `<img>` holding it cannot lose
     * its source under it. Retaining a key that is not loaded yet is fine: the count waits for it.
     */
    retain(key: string): void {
        this.refs.set(key, (this.refs.get(key) ?? 0) + 1);
        this.markUsed(key);
    }

    release(key: string): void {
        const count = (this.refs.get(key) ?? 0) - 1;
        if (count > 0) this.refs.set(key, count);
        else this.refs.delete(key);
        // Drawn until now, so it goes to the back of the eviction order rather than by its load time.
        this.markUsed(key);
        this.scheduleSweep();
    }

    /** Called whenever an entry leaves memory, so a holder can look it up again. */
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /**
     * An object URL for the image, from memory, the store, or one fetch of `url` — in that order.
     * `null` when it could not be fetched; the caller then draws `url` itself. Concurrent loads of one
     * key share a single fetch.
     */
    load(key: string, variant: ImageVariant, url: string): Promise<string | null> {
        const entry = this.memory.get(key);
        if (entry) {
            entry.usedAt = this.now();
            return Promise.resolve(entry.url);
        }
        const running = this.inflight.get(key);
        if (running) {
            // Joined onto a fetch of an older address: if that one had expired, this address still
            // deserves its own try.
            return running.url === url
                ? running.loading
                : running.loading.then(src => src ?? this.load(key, variant, url));
        }

        const loading = this.resolve(key, variant, url)
            .catch(() => null)
            .finally(() => this.inflight.delete(key));
        this.inflight.set(key, { url, loading });
        return loading;
    }

    /**
     * Forgets `key` everywhere — for an entry that turned out not to decode. The caller falls back to
     * the signed address, and the next load fetches the image afresh. Whoever else draws it keeps its
     * count; the object URL itself is revoked at the next sweep.
     */
    invalidate(key: string): void {
        const entry = this.memory.get(key);
        if (entry) {
            this.memory.delete(key);
            this.retired.push(entry.url);
            this.scheduleSweep();
            this.notify();
        }
        void this.deps.store?.delete(key).catch(() => undefined);
    }

    private async resolve(key: string, variant: ImageVariant, url: string): Promise<string | null> {
        const stored = await this.readStore(key);
        if (stored) {
            if (this.now() - stored.usedAt > TOUCH_INTERVAL_MS) {
                void this.deps.store?.touch(key, this.now()).catch(() => undefined);
            }
            return this.remember(key, new Blob([stored.bytes], { type: stored.type }));
        }

        if (this.now() < this.fetchBlockedUntil) return null;
        let response: Response;
        try {
            response = await this.deps.fetch(url);
        } catch (error) {
            // Not an answer but no answer at all: CORS or the network. Back off instead of making every
            // image wait for the same failure.
            this.fetchBlockedUntil = this.now() + FETCH_BACKOFF_MS;
            throw error;
        }
        // An expired or foreign address answers 403 with an XML body; that is not an image to keep.
        const type = response.headers.get('content-type') ?? '';
        if (!response.ok || !type.startsWith('image/')) return null;
        const bytes = await response.arrayBuffer();

        void this.writeStore({ key, variant, type, bytes, size: bytes.byteLength, usedAt: this.now() });
        return this.remember(key, new Blob([bytes], { type }));
    }

    private async readStore(key: string): Promise<ImageCacheRecord | undefined> {
        const store = this.deps.store;
        if (!store) return undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const timeout = new Promise<undefined>(resolve => {
                timer = setTimeout(() => resolve(undefined), STORE_READ_TIMEOUT_MS);
            });
            return (await Promise.race([store.get(key), timeout])) ?? undefined;
        } catch {
            return undefined;
        } finally {
            clearTimeout(timer);
        }
    }

    private async writeStore(record: ImageCacheRecord): Promise<void> {
        try {
            await this.deps.store?.put(record);
            this.scheduleTrim(record.variant);
        } catch {
            // A full or unavailable store only costs the next launch a download.
        }
    }

    private remember(key: string, blob: Blob): string {
        const url = this.deps.createObjectURL(blob);
        this.memory.set(key, { url, size: blob.size, usedAt: this.now() });
        this.scheduleSweep();
        return url;
    }

    private markUsed(key: string): void {
        const entry = this.memory.get(key);
        if (entry) entry.usedAt = this.now();
    }

    private notify(): void {
        this.listeners.forEach(listener => listener());
    }

    private scheduleSweep(): void {
        if (this.sweepTimer) return;
        this.sweepTimer = setTimeout(() => {
            this.sweepTimer = null;
            this.sweep();
        }, SWEEP_DELAY_MS);
    }

    /**
     * Revokes what `invalidate` retired, then the least recently used object URLs no one is drawing,
     * until memory is under budget.
     */
    private sweep(): void {
        this.retired.splice(0).forEach(url => this.deps.revokeObjectURL(url));

        let total = 0;
        for (const entry of this.memory.values()) total += entry.size;
        if (total <= this.memoryMaxBytes) return;

        const idle = [...this.memory.entries()]
            .filter(([key]) => !this.refs.has(key))
            .sort(([, a], [, b]) => a.usedAt - b.usedAt);
        let evicted = false;
        for (const [key, entry] of idle) {
            if (total <= this.memoryMaxBytes) break;
            this.memory.delete(key);
            this.deps.revokeObjectURL(entry.url);
            total -= entry.size;
            evicted = true;
        }
        if (evicted) this.notify();
    }

    private scheduleTrim(variant: ImageVariant): void {
        this.pendingTrims.add(variant);
        if (this.trimTimer) return;
        this.trimTimer = setTimeout(() => {
            this.trimTimer = null;
            const variants = [...this.pendingTrims];
            this.pendingTrims.clear();
            for (const pending of variants) {
                void this.deps.store?.trim(pending, this.budgets[pending]).catch(() => undefined);
            }
        }, TRIM_DELAY_MS);
    }
}
