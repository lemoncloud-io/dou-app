export type ImageVariant = 'thumb' | 'org' | 'frame';

export interface ImageCacheRecord {
    key: string;
    variant: ImageVariant;
    type: string;
    bytes: ArrayBuffer;
    size: number;
    usedAt: number;
}

export interface ImageCacheStore {
    get(key: string): Promise<ImageCacheRecord | undefined>;
    put(record: ImageCacheRecord): Promise<void>;
    touch(key: string, usedAt: number): Promise<void>;
    delete(key: string): Promise<void>;
    trim(variant: ImageVariant, maxBytes: number): Promise<void>;
}

export interface ImageLoadReport {
    variant: ImageVariant;
    source: 'store' | 'network' | 'address';
    store: 'hit' | 'miss' | 'timeout' | 'error' | 'none';
    fallback?: 'expired' | 'http' | 'not_image' | 'no_answer' | 'backoff';
    totalMs: number;
    storeMs: number;
    fetchMs?: number;
    bytes?: number;
}

type StoreRead = { record?: ImageCacheRecord; outcome: ImageLoadReport['store'] };

export interface ImageCacheDeps {
    store: ImageCacheStore | null;
    fetch: (url: string, signal: AbortSignal) => Promise<Response>;
    createObjectURL: (blob: Blob) => string;
    revokeObjectURL: (url: string) => void;
    now?: () => number;
    budgets?: Record<ImageVariant, number>;
    memoryMaxBytes?: number;
    observe?: () => ((report: ImageLoadReport) => void) | undefined;
    elapsed?: () => number;
}

export const DEFAULT_IMAGE_CACHE_BUDGETS: Record<ImageVariant, number> = {
    thumb: 50 * 1024 * 1024,
    org: 150 * 1024 * 1024,
    frame: 20 * 1024 * 1024,
};
const DEFAULT_MEMORY_MAX_BYTES = 40 * 1024 * 1024;
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;
const TRIM_DELAY_MS = 2000;
const SWEEP_DELAY_MS = 1000;
const STORE_READ_TIMEOUT_MS = 1000;
const FETCH_BACKOFF_MS = 60 * 1000;

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
    private readonly refs = new Map<string, number>();
    private readonly abandoned = new Set<string>();
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

    peek(key: string): string | undefined {
        return this.memory.get(key)?.url;
    }

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
        this.markUsed(key);
        this.scheduleSweep();
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    load(key: string, variant: ImageVariant, url: string): Promise<string | null> {
        const entry = this.memory.get(key);
        if (entry) {
            entry.usedAt = this.now();
            return Promise.resolve(entry.url);
        }
        const running = this.inflight.get(key);
        if (running && !running.controller.signal.aborted) {
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
                if (this.inflight.get(key)?.loading === loading) this.inflight.delete(key);
            });
        this.inflight.set(key, { url, loading, controller });
        return loading;
    }

    async lookup(key: string): Promise<string | null> {
        const entry = this.memory.get(key);
        if (entry) {
            entry.usedAt = this.now();
            return entry.url;
        }
        const stored = (await this.readStore(key)).record;
        if (!stored) return null;
        const raced = this.memory.get(key);
        if (raced) return raced.url;
        if (this.now() - stored.usedAt > TOUCH_INTERVAL_MS) {
            void this.deps.store?.touch(key, this.now()).catch(() => undefined);
        }
        return this.remember(key, new Blob([stored.bytes], { type: stored.type }));
    }

    async put(key: string, variant: ImageVariant, blob: Blob): Promise<string> {
        const existing = this.memory.get(key);
        if (existing) return existing.url;
        const bytes = await bytesOf(blob);
        void this.writeStore({ key, variant, type: blob.type, bytes, size: bytes.byteLength, usedAt: this.now() });
        return this.memory.get(key)?.url ?? this.remember(key, blob);
    }

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
            if (!signal.aborted) {
                this.fetchBlockedUntil = this.now() + FETCH_BACKOFF_MS;
                report({ source: 'address', fallback: 'no_answer', fetchMs: this.elapsed() - fetchedAt });
            }
            throw error;
        }
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
            if (!signal.aborted) {
                report({ source: 'address', fallback: 'no_answer', fetchMs: this.elapsed() - fetchedAt });
            }
            throw error;
        }

        void this.writeStore({ key, variant, type, bytes, size: bytes.byteLength, usedAt: this.now() });
        report({ source: 'network', fetchMs: this.elapsed() - fetchedAt, bytes: bytes.byteLength });
        return this.remember(key, new Blob([bytes], { type }));
    }

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
