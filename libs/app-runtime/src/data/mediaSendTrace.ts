import { isPageHidden, pageHideCount, perfNow, recordPerfSample } from '@chatic/perf';
import { type ChatAttachmentSource, chatAttachmentSourceFormat } from '@chatic/data';

/**
 * At most this many `chat_send_media` samples per minute.
 *
 * Every trace a device records shares one Firebase Performance budget (300 per ten minutes in the
 * foreground). An attachment send is a deliberate act, so this is rarely reached; it is a guard
 * against a burst of retries, not a sampling rate.
 */
export const CHAT_SEND_MEDIA_SAMPLES_PER_MINUTE = 10;

const MINUTE_MS = 60_000;

/**
 * The points an attachment send passes, in order, each recorded as ms from the start:
 *
 * - `row` — the pending row is written, so the message shows as sending
 * - `converted` — the shell's video conversion is done (only when a video needed it)
 * - `socket` — the cloud's socket is ready for the upload requests
 * - `prepared` — the last file is resized or encoded, its thumbnail made
 * - `upload_started` — the upload tickets came back
 * - `bytes_sent` — every file's upload has settled, stored or failed
 * - `upload_completed` — the server has confirmed the uploads
 * - `sent` — the message is sent and its row replaced (with the read-back of the server's row)
 */
export type MediaSendPhase =
    | 'row'
    | 'converted'
    | 'socket'
    | 'prepared'
    | 'upload_started'
    | 'bytes_sent'
    | 'upload_completed'
    | 'sent';

/** `partial` — sent, but some files were left out and kept as a failed row of their own. */
export type MediaSendOutcome = 'ok' | 'partial' | 'error';

export interface MediaSendTiming {
    /** Records `phase` at the time it is reached. The first mark of a phase counts. */
    mark(phase: MediaSendPhase): void;
    /** Records the send as a sample, once. Nothing after the first call counts. */
    end(outcome: MediaSendOutcome): void;
}

const NOOP_TIMING: MediaSendTiming = { mark: () => undefined, end: () => undefined };

/** `image` / `video` / `file` when every file is that kind, else `mixed`. */
export const mediaKindOf = (files: readonly ChatAttachmentSource[]): string => {
    const kinds = new Set(files.map(file => chatAttachmentSourceFormat(file)?.kind ?? 'file'));
    return kinds.size === 1 ? [...kinds][0] : 'mixed';
};

/** The file count in three buckets, so it can be an attribute: one, a few, or many (the cap is ten). */
export const mediaCountBucket = (count: number): string => (count <= 1 ? '1' : count <= 5 ? '2-5' : '6+');

/**
 * The picked size in buckets, so it can be an attribute. Picked, not sent: images are resized before
 * they go, and a shell video's size is only known after conversion. The exact total is the `bytes_kb`
 * metric.
 */
export const mediaSizeBucket = (bytes: number): string => {
    const mb = bytes / (1024 * 1024);
    if (mb < 1) return '<1mb';
    if (mb < 10) return '1-10mb';
    if (mb < 50) return '10-50mb';
    return '50mb+';
};

interface MediaSendTracerOptions {
    /** Overridable for tests. */
    now?: () => number;
    clock?: () => number;
    record?: typeof recordPerfSample;
    isHidden?: () => boolean;
    hideCount?: () => number;
}

/**
 * Times attachment sends — images, videos, documents — as `chat_send_media` samples, from the send
 * being asked for to its end, with each phase on the way (`MediaSendPhase`).
 *
 * Recorded as a sample, timed here, rather than as a trace started and stopped in Firebase: the native
 * backend forgets a trace left open for two minutes, and a large video's send can take longer. As a
 * start and a stop, exactly the slowest sends would go missing.
 *
 * The console breaks it down by `kind` (`image` / `video` / `file` / `mixed`), `count` and `size`
 * (buckets), `thread` (`root` / `reply`) and `outcome`. A retry is marked by the `retry` metric (1),
 * because the attributes are at Firebase's cap of five.
 *
 * A send the page was hidden during is dropped: a native upload carries on in the background, but the
 * sample would time the absence. A send from a hidden page is not timed at all.
 */
export const createMediaSendTracer = ({
    now = Date.now,
    clock = perfNow,
    record = recordPerfSample,
    isHidden = isPageHidden,
    hideCount = pageHideCount,
}: MediaSendTracerOptions = {}) => {
    let windowStart = Number.NEGATIVE_INFINITY;
    let startedInWindow = 0;

    return (context: { files: readonly ChatAttachmentSource[]; reply: boolean; retry: boolean }): MediaSendTiming => {
        if (isHidden()) return NOOP_TIMING;
        const at = now();
        if (at - windowStart >= MINUTE_MS) {
            windowStart = at;
            startedInWindow = 0;
        }
        if (startedInWindow >= CHAT_SEND_MEDIA_SAMPLES_PER_MINUTE) return NOOP_TIMING;
        startedInWindow += 1;

        const startedAt = clock();
        const hidesAtStart = hideCount();
        const bytes = context.files.reduce((sum, file) => sum + (file.size ?? 0), 0);
        const marks = new Map<MediaSendPhase, number>();
        let ended = false;

        return {
            mark: phase => {
                if (ended || marks.has(phase)) return;
                marks.set(phase, Math.round(clock() - startedAt));
            },
            end: outcome => {
                if (ended) return;
                ended = true;
                if (isHidden() || hideCount() !== hidesAtStart) return;
                const metrics: Record<string, number> = {
                    value_ms: Math.round(clock() - startedAt),
                    bytes_kb: Math.round(bytes / 1024),
                    files: context.files.length,
                    retry: context.retry ? 1 : 0,
                };
                for (const [phase, ms] of marks) metrics[`${phase}_ms`] = ms;
                record('chat_send_media', {
                    attributes: {
                        kind: mediaKindOf(context.files),
                        count: mediaCountBucket(context.files.length),
                        size: mediaSizeBucket(bytes),
                        thread: context.reply ? 'reply' : 'root',
                        outcome,
                    },
                    metrics,
                });
            },
        };
    };
};

/** The page's tracer: module scope, so the per-minute cap counts every send the page makes. */
export const beginMediaSendTiming = createMediaSendTracer();
