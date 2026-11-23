import { isPageHidden, pageHideCount, perfNow, recordPerfSample } from '@chatic/perf';
import { type ChatAttachmentSource, chatAttachmentSourceFormat } from '@chatic/data';

export const CHAT_SEND_MEDIA_SAMPLES_PER_MINUTE = 10;

const MINUTE_MS = 60_000;

export type MediaSendPhase =
    | 'row'
    | 'converted'
    | 'socket'
    | 'prepared'
    | 'upload_started'
    | 'bytes_sent'
    | 'upload_completed'
    | 'sent';

export type MediaSendOutcome = 'ok' | 'partial' | 'error';

export interface MediaSendTiming {
    mark(phase: MediaSendPhase): void;
    end(outcome: MediaSendOutcome): void;
}

const NOOP_TIMING: MediaSendTiming = { mark: () => undefined, end: () => undefined };

export const mediaKindOf = (files: readonly ChatAttachmentSource[]): string => {
    const kinds = new Set(files.map(file => chatAttachmentSourceFormat(file)?.kind ?? 'file'));
    return kinds.size === 1 ? [...kinds][0] : 'mixed';
};

export const mediaCountBucket = (count: number): string => (count <= 1 ? '1' : count <= 5 ? '2-5' : '6+');

export const mediaSizeBucket = (bytes: number): string => {
    const mb = bytes / (1024 * 1024);
    if (mb < 1) return '<1mb';
    if (mb < 10) return '1-10mb';
    if (mb < 50) return '10-50mb';
    return '50mb+';
};

interface MediaSendTracerOptions {
    now?: () => number;
    clock?: () => number;
    record?: typeof recordPerfSample;
    isHidden?: () => boolean;
    hideCount?: () => number;
}

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

export const beginMediaSendTiming = createMediaSendTracer();
