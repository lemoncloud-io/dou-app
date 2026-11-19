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
 *
 * A download nobody draws any more is cancelled. The bucket speaks HTTP/1.1, so the page gets about six
 * connections to it, and an original is several megabytes: swiping through a message's photos on a
 * slow network left the originals already swiped past holding every connection, and the photo on
 * screen — its thumbnail included — waited behind them on black.
 */

/**
 * - `thumb` / `org` — an upload's thumbnail and original, fetched from their signed addresses.
 * - `frame` — the first frame of a video that came without a poster, made on this device (by the shell,
 *   or by the page from the video's first bytes) and `put` here; there is no address to fetch it from.
 */
export type ImageVariant = 'thumb' | 'org' | 'frame';

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

/**
 * How one image the cache did not have in memory was resolved — what the `image_load` measurement
 * records. A memory hit, and a load that joined one already running and took its answer, are not
 * reports of their own; a joined load that retries with its own, newer address after the running one
 * answered nothing is — so one image can report `expired` and then `network`. A cancelled download is
 * not reported at all, since nobody waited for it.
 */
export interface ImageLoadReport {
    variant: ImageVariant;
    /** Where the drawn copy came from; `address` means none was kept and the caller draws the signed address. */
    source: 'store' | 'network' | 'address';
    /**
     * What the persistent store answered: `timeout` is a read slower than the cache waits for, which
     * is then treated as a miss; `none` is a page with no store to ask.
     */
    store: 'hit' | 'miss' | 'timeout' | 'error' | 'none';
    /**
     * Why the signed address is drawn instead, when it is: `expired` (a 403, which is what an expired
     * signature answers), `http` (any other non-2xx), `not_image` (a body of another type), `no_answer`
     * (no response at all — CORS or the network) or `backoff` (a recent `no_answer` skipped the fetch).
     */
    fallback?: 'expired' | 'http' | 'not_image' | 'no_answer' | 'backoff';
    /** From the load's start to the decision, store read and download included. */
    totalMs: number;
    storeMs: number;
    /** From the fetch to the body's last byte; absent when nothing was fetched. */
    fetchMs?: number;
    /** The body's size, for a download that was kept. */
    bytes?: number;
}

type StoreRead = { record?: ImageCacheRecord; outcome: ImageLoadReport['store'] };

export interface ImageCacheDeps {
    /** `null` where no persistent store can be opened; the memory layer still works. */
    store: ImageCacheStore | null;
    /** `signal` aborts a download nobody draws any more; the body read must honour it too. */
    fetch: (url: string, signal: AbortSignal) => Promise<Response>;
    createObjectURL: (blob: Blob) => string;
    revokeObjectURL: (url: string) => void;
    now?: () => number;
    /** Persistent budget per variant, in bytes. */
    budgets?: Record<ImageVariant, number>;
    /** How many bytes of object URLs no one is drawing may stay in memory. */
    memoryMaxBytes?: number;
    /**
     * Measurement only, as a begin/end pair: called when a load starts resolving, and the function it
     * returns (if any) is told how that load ended. A begin lets the measurement note what it needs at
     * the start — whether the page hides before the end, say — without this cache knowing about it.
     * What either throws is ignored.
     */
    observe?: () => ((report: ImageLoadReport) => void) | undefined;
    /** A monotonic clock in ms for the durations `observe` is told; `now` when absent. */
    elapsed?: () => number;
}

/**
 * About a thousand thumbnails (they land at 30–50KB), and a few dozen originals: an original is
 * uploaded as picked, so a single one can be several megabytes, and a separate budget keeps a handful
 * of opened photos from pushing every thumbnail out. Frames are a few hundred to a thousand at 3–40KB
 * each; they cost a video read to make again, so they keep a budget of their own rather than compete
 * with the thumbnails.
 */
export const DEFAULT_IMAGE_CACHE_BUDGETS: Record<ImageVariant, number> = {
    thumb: 50 * 1024 * 1024,
    org: 150 * 1024 * 1024,
    frame: 20 * 1024 * 1024,
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

/** A blob's bytes. `FileReader` where `Blob.arrayBuffer` is missing — WebKit before 14 has none. */
const bytesOf = (blob: Blob): Promise<ArrayBuffer> =>
    typeof blob.arrayBuffer === 'function'
        ? blob.arrayBuffer()
        : new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as ArrayBuffer);
              reader.onerror = () => reject(reader.error);
              reader.readAsArrayBuffer(blob);
          });

export const imageCacheKey = (cid: string, uploadId: string, variant: ImageVariant): string =>
    `${cid}/${uploadId}/${variant}`;

interface MemoryEntry {
    url: string;
    size: number;
    usedAt: number;
}

export class ImageCache {
    private readonly memory = new Map<string, MemoryEntry>();
    private readonly inflight = new Map<
        string,
        { url: string; loading: Promise<string | null>; controller: AbortController }
    >();
    // Kept apart from `memory` so an entry can come and go — loaded late, invalidated — without
    // losing count of who is drawing it.
    private readonly refs = new Map<string, number>();
    // Keys whose last holder let go since the last sweep. A download still running for one of them is
    // cancelled at the sweep, unless it was taken again by then — a redraw lets go and takes back in
    // one commit. Only a key that was held counts: a load nobody ever retained is not abandoned.
    private readonly abandoned = new Set<string>();
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
    private readonly elapsed: () => number;

    constructor(private readonly deps: ImageCacheDeps) {
        this.now = deps.now ?? Date.now;
        this.budgets = deps.budgets ?? DEFAULT_IMAGE_CACHE_BUDGETS;
        this.memoryMaxBytes = deps.memoryMaxBytes ?? DEFAULT_MEMORY_MAX_BYTES;
        this.elapsed = deps.elapsed ?? this.now;
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
        this.abandoned.delete(key);
        this.markUsed(key);
    }

    release(key: string): void {
        const count = (this.refs.get(key) ?? 0) - 1;
        if (count > 0) this.refs.set(key, count);
        else {
            this.refs.delete(key);
            this.abandoned.add(key);
        }
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
     * `null` when it could not be fetched, or was cancelled because nobody draws it any more; the caller
     * then draws `url` itself. Concurrent loads of one key share a single fetch.
     */
    load(key: string, variant: ImageVariant, url: string): Promise<string | null> {
        const entry = this.memory.get(key);
        if (entry) {
            entry.usedAt = this.now();
            return Promise.resolve(entry.url);
        }
        const running = this.inflight.get(key);
        // A cancelled download is nobody's any more: a load arriving before it settles starts its own
        // instead of inheriting the cancellation.
        if (running && !running.controller.signal.aborted) {
            // Joined onto a fetch of an older address: if that one had expired, this address still
            // deserves its own try — but not once it was cancelled, which means nobody holds the key,
            // and the retry would be a download no sweep could reach.
            return running.url === url
                ? running.loading
                : running.loading.then(
                      src => src ?? (running.controller.signal.aborted ? null : this.load(key, variant, url))
                  );
        }

        const controller = new AbortController();
        const loading: Promise<string | null> = this.resolve(key, variant, url, controller.signal)
            .catch(() => null)
            .finally(() => {
                // A cancelled download may have been replaced already by a fresh one for the same key.
                if (this.inflight.get(key)?.loading === loading) this.inflight.delete(key);
            });
        this.inflight.set(key, { url, loading, controller });
        return loading;
    }

    /**
     * The object URL for `key` from memory or the store, never from the network — for an image made on
     * this device rather than downloaded (`frame`). `null` on a miss.
     */
    async lookup(key: string): Promise<string | null> {
        const entry = this.memory.get(key);
        if (entry) {
            entry.usedAt = this.now();
            return entry.url;
        }
        const stored = (await this.readStore(key)).record;
        if (!stored) return null;
        // Another lookup may have filled memory while the store answered; one object URL per key.
        const raced = this.memory.get(key);
        if (raced) return raced.url;
        if (this.now() - stored.usedAt > TOUCH_INTERVAL_MS) {
            void this.deps.store?.touch(key, this.now()).catch(() => undefined);
        }
        return this.remember(key, new Blob([stored.bytes], { type: stored.type }));
    }

    /**
     * Keeps bytes made on this device under `key`, in memory and in the store, and answers their object
     * URL. A key already in memory keeps the copy it has: an `<img>` may be drawing it.
     */
    async put(key: string, variant: ImageVariant, blob: Blob): Promise<string> {
        const existing = this.memory.get(key);
        if (existing) return existing.url;
        const bytes = await bytesOf(blob);
        void this.writeStore({ key, variant, type: blob.type, bytes, size: bytes.byteLength, usedAt: this.now() });
        return this.memory.get(key)?.url ?? this.remember(key, blob);
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

    private async resolve(
        key: string,
        variant: ImageVariant,
        url: string,
        signal: AbortSignal
    ): Promise<string | null> {
        const startedAt = this.elapsed();
        const ended = this.beginReport();
        const read = await this.readStore(key);
        const storeMs = this.elapsed() - startedAt;
        const report = (rest: Pick<ImageLoadReport, 'source' | 'fallback' | 'fetchMs' | 'bytes'>) =>
            this.endReport(ended, {
                variant,
                store: read.outcome,
                storeMs,
                totalMs: this.elapsed() - startedAt,
                ...rest,
            });

        const stored = read.record;
        if (stored) {
            if (this.now() - stored.usedAt > TOUCH_INTERVAL_MS) {
                void this.deps.store?.touch(key, this.now()).catch(() => undefined);
            }
            report({ source: 'store' });
            return this.remember(key, new Blob([stored.bytes], { type: stored.type }));
        }

        if (signal.aborted) return null;
        if (this.now() < this.fetchBlockedUntil) {
            report({ source: 'address', fallback: 'backoff' });
            return null;
        }
        const fetchedAt = this.elapsed();
        let response: Response;
        try {
            response = await this.deps.fetch(url, signal);
        } catch (error) {
            // Not an answer but no answer at all: CORS or the network. Back off instead of making every
            // image wait for the same failure. A cancellation says nothing about the bucket.
            if (!signal.aborted) {
                this.fetchBlockedUntil = this.now() + FETCH_BACKOFF_MS;
                report({ source: 'address', fallback: 'no_answer', fetchMs: this.elapsed() - fetchedAt });
            }
            throw error;
        }
        // An expired or foreign address answers 403 with an XML body; that is not an image to keep.
        const type = response.headers.get('content-type') ?? '';
        if (!response.ok || !type.startsWith('image/')) {
            const fallback = response.ok ? 'not_image' : response.status === 403 ? 'expired' : 'http';
            report({ source: 'address', fallback, fetchMs: this.elapsed() - fetchedAt });
            return null;
        }
        let bytes: ArrayBuffer;
        try {
            bytes = await response.arrayBuffer();
        } catch (error) {
            // The connection broke mid-body; unlike a failed fetch the bucket did answer, so no backoff.
            if (!signal.aborted) {
                report({ source: 'address', fallback: 'no_answer', fetchMs: this.elapsed() - fetchedAt });
            }
            throw error;
        }

        void this.writeStore({ key, variant, type, bytes, size: bytes.byteLength, usedAt: this.now() });
        report({ source: 'network', fetchMs: this.elapsed() - fetchedAt, bytes: bytes.byteLength });
        return this.remember(key, new Blob([bytes], { type }));
    }

    // A measurement must never cost an image: what the observer throws is swallowed at both ends.
    private beginReport(): ((report: ImageLoadReport) => void) | undefined {
        try {
            return this.deps.observe?.();
        } catch {
            return undefined;
        }
    }

    private endReport(ended: ((report: ImageLoadReport) => void) | undefined, report: ImageLoadReport): void {
        try {
            ended?.(report);
        } catch {
            // Ignored, as above.
        }
    }

    private async readStore(key: string): Promise<StoreRead> {
        const store = this.deps.store;
        if (!store) return { outcome: 'none' };
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const timeout = new Promise<'timeout'>(resolve => {
                timer = setTimeout(() => resolve('timeout'), STORE_READ_TIMEOUT_MS);
            });
            const answer = await Promise.race([store.get(key), timeout]);
            if (answer === 'timeout') return { outcome: 'timeout' };
            return answer ? { record: answer, outcome: 'hit' } : { outcome: 'miss' };
        } catch {
            return { outcome: 'error' };
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
     * Cancels the downloads nobody draws any more, revokes what `invalidate` retired, then the least
     * recently used object URLs no one is drawing, until memory is under budget.
     */
    private sweep(): void {
        for (const key of this.abandoned) {
            if (!this.refs.has(key)) this.inflight.get(key)?.controller.abort();
        }
        this.abandoned.clear();
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
