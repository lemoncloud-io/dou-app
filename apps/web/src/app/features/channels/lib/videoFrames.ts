import type { VideoFrame } from '@chatic/shared';

import type { ImageCache } from './imageCache';

export type FrameOutcome = { kind: 'image'; src: string } | { kind: 'element' } | { kind: 'none' };

export interface VideoFrameRequest {
    key: string;
    url: string;
}

export type ShellFrameReader = (url: string) => Promise<Blob>;

export interface VideoFramesDeps {
    cache: Pick<ImageCache, 'lookup' | 'put'>;
    fromApp: () => boolean;
    readShellFrame: ShellFrameReader;
    fetch: (url: string, init: RequestInit) => Promise<Response>;
    drawFrame: (source: Blob) => Promise<VideoFrame | null>;
    concurrency?: number;
}

export const FRAME_RANGE = 'bytes=0-2097151';

interface Job {
    id: string;
    request: VideoFrameRequest;
    waiters: number;
    started: boolean;
    promise: Promise<FrameOutcome | null>;
    resolve: (outcome: FrameOutcome | null) => void;
}

type Made = { kind: 'image'; src: string } | { kind: 'element' | 'none'; byUpload: boolean };

const idOf = (request: VideoFrameRequest) => `${request.key}\u0000${request.url}`;

export class VideoFrames {
    private corsBlocked = false;
    private readonly byKey = new Map<string, Exclude<FrameOutcome, { kind: 'image' }>>();
    private readonly byAddress = new Map<string, Exclude<FrameOutcome, { kind: 'image' }>>();
    private readonly jobs = new Map<string, Job>();
    private readonly queue: Job[] = [];
    private running = 0;
    private readonly concurrency: number;

    constructor(private readonly deps: VideoFramesDeps) {
        this.concurrency = deps.concurrency ?? 2;
    }

    settled(request: VideoFrameRequest): Exclude<FrameOutcome, { kind: 'image' }> | undefined {
        return this.byKey.get(request.key) ?? this.byAddress.get(idOf(request));
    }

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
        const made = this.deps.fromApp() ? await this.fromShell(request.url) : await this.fromBucket(request.url);
        if (made instanceof Blob) {
            return { kind: 'image', src: await this.deps.cache.put(request.key, 'frame', made) };
        }
        return made;
    }

    private async fromShell(url: string): Promise<Blob | Made> {
        try {
            return await this.deps.readShellFrame(url);
        } catch {
            return { kind: 'none', byUpload: false };
        }
    }

    private async fromBucket(url: string): Promise<Blob | Made> {
        if (this.corsBlocked) return { kind: 'element', byUpload: true };
        let response: Response;
        try {
            response = await this.deps.fetch(url, {
                mode: 'cors',
                credentials: 'omit',
                cache: 'no-store',
                headers: { Range: FRAME_RANGE },
            });
        } catch {
            this.corsBlocked = true;
            return { kind: 'element', byUpload: true };
        }
        if (!response.ok) return { kind: 'element', byUpload: false };
        if (response.status !== 206) {
            void response.body?.cancel().catch(() => undefined);
            return { kind: 'element', byUpload: true };
        }
        const frame = await this.deps.drawFrame(await response.blob());
        return frame ? frame.blob : { kind: 'element', byUpload: true };
    }
}
