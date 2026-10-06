import type { VideoFrame } from '@chatic/shared';

import type { ImageCache } from './imageCache';

/**
 * The first frame of a received video that came without a poster — what its tile draws instead of the
 * grey panel.
 *
 * The order is fixed: the server's thumbnail when there is one (the caller never asks then), then a
 * frame this device made earlier and kept in the image cache, then making one now. Making one costs a
 * read of the remote video, so it runs for tiles on screen only, two at a time, and a request still
 * waiting when its tile leaves the screen is dropped.
 *
 * How a frame is made depends on the shell:
 * - **In the app** the shell makes it (`ReadVideoFrame`) from the signed address. The page cannot:
 *   the iOS WebView loads no media at all before a tap, `blob:` addresses included, and that setting
 *   stays as it is.
 * - **In a browser** the page fetches the video's first 2 MiB with CORS and draws the frame from those
 *   bytes, the same routine a sent video's poster uses. That needs CORS on the bucket, which is
 *   learned rather than assumed: the first fetch that cannot be made settles it for the session, and
 *   from then on the tile draws the frame with a muted `<video>` of its own (`element`), which needs no
 *   CORS but has no cache other than the browser's.
 *
 * An app from before `ReadVideoFrame` answers `NOT_FOUND`, learned once: Android then uses the
 * `<video>` path, which its WebView draws; iOS stays grey, since its WebView would load nothing.
 */
export type FrameOutcome =
    /** A JPEG in the image cache; `src` is its object URL. */
    | { kind: 'image'; src: string }
    /** Let the tile draw the frame itself, from the video's address. */
    | { kind: 'element' }
    /** Nothing to draw: the grey panel stays. */
    | { kind: 'none' };

export interface VideoFrameRequest {
    /** `imageCacheKey(cid, uploadId, 'frame')`. */
    key: string;
    /** The video's signed address. */
    url: string;
}

/** The shell's answer, as bytes. Rejects with the bridge's or the shell's `code`. */
export type ShellFrameReader = (url: string) => Promise<Blob>;

export interface VideoFramesDeps {
    cache: Pick<ImageCache, 'lookup' | 'put'>;
    isNative: () => boolean;
    /** iOS and iPadOS WebKit, whose app WebView loads no media before a tap. */
    isAppleTouch: () => boolean;
    readShellFrame: ShellFrameReader;
    fetch: (url: string, init: RequestInit) => Promise<Response>;
    /** `drawVideoFrame` from `@chatic/shared`. */
    drawFrame: (source: Blob) => Promise<VideoFrame | null>;
    /** How many frames are made at once. Default 2. */
    concurrency?: number;
}

/**
 * The first 2 MiB. A phone recording with its index first has its 0.5 s frame in about 1.9 MB at
 * 1080p; one with its index last, or a high-bitrate 4K, does not decode from it, and those fall back to
 * the `<video>` path.
 */
export const FRAME_RANGE = 'bytes=0-2097151';

interface Job {
    id: string;
    request: VideoFrameRequest;
    /** Requests waiting on this job; a queued job nobody waits on any more is dropped. */
    waiters: number;
    started: boolean;
    promise: Promise<FrameOutcome | null>;
    resolve: (outcome: FrameOutcome | null) => void;
}

/** What making a frame came to, and whether a failure is the video's own (kept by upload) or the address's. */
type Made = { kind: 'image'; src: string } | { kind: 'element' | 'none'; byUpload: boolean };

const idOf = (request: VideoFrameRequest) => `${request.key}\u0000${request.url}`;
const codeOf = (error: unknown) => (error as { code?: string } | null)?.code;

export class VideoFrames {
    /** Set by the first `NOT_FOUND`: this app has no `ReadVideoFrame`. */
    private shellAbsent = false;
    /** Set by the first CORS fetch that could not be made: the bucket sends no CORS headers here. */
    private corsBlocked = false;
    /**
     * What could not be drawn as an image, for the page's life — so a tile that comes back on screen
     * does not read the video again. Two keys, because the reasons differ in what they outlive:
     * - by upload (`byKey`) when the reason is the video itself — its first bytes do not draw. A
     *   message is read again on every visit and its address signed anew each time, so keyed by address
     *   this would read 2 MiB of the same video again on every visit, to the same end.
     * - by upload and address (`byAddress`) when the reason may be the address — an expired one (403),
     *   or a shell read that failed. A refreshed address gets its own try.
     */
    private readonly byKey = new Map<string, Exclude<FrameOutcome, { kind: 'image' }>>();
    private readonly byAddress = new Map<string, Exclude<FrameOutcome, { kind: 'image' }>>();
    private readonly jobs = new Map<string, Job>();
    private readonly queue: Job[] = [];
    private running = 0;
    private readonly concurrency: number;

    constructor(private readonly deps: VideoFramesDeps) {
        this.concurrency = deps.concurrency ?? 2;
    }

    /** What is already known for `request` that is not an image: `element`, `none`, or undefined. */
    settled(request: VideoFrameRequest): Exclude<FrameOutcome, { kind: 'image' }> | undefined {
        return this.byKey.get(request.key) ?? this.byAddress.get(idOf(request));
    }

    /**
     * Resolves the frame for `request`: from the cache, else made now. `cancel` withdraws this request;
     * a job no request waits on any more is dropped if it has not started, and its promise answers
     * `null`. One that has started runs on — what it makes is kept for the next time.
     */
    request(request: VideoFrameRequest): { result: Promise<FrameOutcome | null>; cancel: () => void } {
        const id = idOf(request);
        const known = this.settled(request);
        if (known) return { result: Promise.resolve(known), cancel: () => undefined };

        let job = this.jobs.get(id);
        if (!job) {
            let resolve: Job['resolve'] = () => undefined;
            const promise = new Promise<FrameOutcome | null>(r => (resolve = r));
            job = { id, request, waiters: 0, started: false, promise, resolve };
            this.jobs.set(id, job);
            void this.begin(job);
        }
        job.waiters += 1;
        const taken = job;
        let cancelled = false;
        return {
            result: taken.promise,
            cancel: () => {
                if (cancelled) return;
                cancelled = true;
                taken.waiters -= 1;
                if (taken.waiters > 0 || taken.started) return;
                const at = this.queue.indexOf(taken);
                if (at >= 0) this.queue.splice(at, 1);
                this.jobs.delete(taken.id);
                taken.resolve(null);
            },
        };
    }

    /** Looks in the cache first — no slot needed for that — and queues the job only on a miss. */
    private async begin(job: Job): Promise<void> {
        const cached = await this.deps.cache.lookup(job.request.key).catch(() => null);
        if (this.jobs.get(job.id) !== job) return;
        if (cached) return this.settle(job, { kind: 'image', src: cached });
        this.queue.push(job);
        this.pump();
    }

    private pump(): void {
        while (this.running < this.concurrency && this.queue.length > 0) {
            const job = this.queue.shift() as Job;
            job.started = true;
            this.running += 1;
            void this.make(job.request)
                .catch((): Made => ({ kind: 'none', byUpload: false }))
                .then(outcome => this.settle(job, outcome))
                .finally(() => {
                    this.running -= 1;
                    this.pump();
                });
        }
    }

    private settle(job: Job, outcome: Made): void {
        if (outcome.kind !== 'image') {
            const { kind } = outcome;
            if (outcome.byUpload) this.byKey.set(job.request.key, { kind });
            else this.byAddress.set(job.id, { kind });
        }
        this.jobs.delete(job.id);
        job.resolve(outcome.kind === 'image' ? outcome : { kind: outcome.kind });
    }

    private async make(request: VideoFrameRequest): Promise<Made> {
        const made = this.deps.isNative() ? await this.fromShell(request.url) : await this.fromBucket(request.url);
        if (made instanceof Blob) {
            return { kind: 'image', src: await this.deps.cache.put(request.key, 'frame', made) };
        }
        return made;
    }

    private async fromShell(url: string): Promise<Blob | Made> {
        if (!this.shellAbsent) {
            try {
                return await this.deps.readShellFrame(url);
            } catch (error) {
                // Anything but NOT_FOUND is about this read — an expired address, the network, a codec —
                // not the app. The shell cannot tell them apart, so a fresh address gets another try.
                if (codeOf(error) !== 'NOT_FOUND') return { kind: 'none', byUpload: false };
                this.shellAbsent = true;
            }
        }
        return { kind: this.deps.isAppleTouch() ? 'none' : 'element', byUpload: true };
    }

    private async fromBucket(url: string): Promise<Blob | Made> {
        if (this.corsBlocked) return { kind: 'element', byUpload: true };
        let response: Response;
        try {
            response = await this.deps.fetch(url, {
                mode: 'cors',
                credentials: 'omit',
                // Never from the HTTP cache: a copy a `<video>` or `<img>` left there was fetched without
                // CORS and carries no CORS headers, so a fetch served from it fails as if the bucket had
                // none.
                cache: 'no-store',
                headers: { Range: FRAME_RANGE },
            });
        } catch {
            // No answer at all — CORS, as far as the page can tell. Settled for the session.
            this.corsBlocked = true;
            return { kind: 'element', byUpload: true };
        }
        // An expired address (403): the element may fare no better, but a fresh address deserves a fetch.
        if (!response.ok) return { kind: 'element', byUpload: false };
        // A 200 is a server that ignored the range and is sending the whole video. Reading it into a blob
        // would download the very file this path exists not to, so it is left to the element instead.
        if (response.status !== 206) {
            void response.body?.cancel().catch(() => undefined);
            return { kind: 'element', byUpload: true };
        }
        const frame = await this.deps.drawFrame(await response.blob());
        // Not drawable from its first bytes (index last, a GOP past 2 MiB) — a fact about the video, not
        // the address: the element reads what it needs, on this visit and the next.
        return frame ? frame.blob : { kind: 'element', byUpload: true };
    }
}
