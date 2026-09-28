/**
 * Upload response mirror, its runtime guard, and the ports the image send sequence runs on.
 *
 * **Why a mirror.** `@lemoncloud/chatic-socials-api` re-exports its upload response types
 * (`UploadStartResult`, `UploadTicket`, `UploadStatus`, …) from `lemon-model/upload`, and the root
 * `resolutions."lemon-model"` pin (1.2.2) predates that entry point. Under `skipLibCheck` every one
 * of those names silently resolves to `any` — `const x: UploadStartResult = 42` compiles. So this
 * file carries the shape itself: only the fields the send sequence reads, with names copied from
 * the `lemon-model` 1.5 `upload` contract.
 *
 * **Delete this mirror when the pin reaches `lemon-model` >= 1.5** and read the SDK types instead.
 * Until then nothing outside the upload data source may see the raw `any` response: the guard
 * below is the one place it becomes a typed value.
 */

import type { PendingUploadSlot } from '@chatic/app-messages';
import type { UploadCompleteInput, UploadStartInput } from '@lemoncloud/chatic-sockets-lib';

/** The server's lifecycle of one upload. */
export type UploadStatusMirror = 'pending' | 'stored' | 'failed';

const UPLOAD_STATUSES: readonly UploadStatusMirror[] = ['pending', 'stored', 'failed'];

/**
 * A presigned PUT destination. **`url` and `headers` are credentials** — never log them, persist
 * them, or put them in an error message. The ticket's other fields (`kind`, `maxBytes`,
 * `expiresAt`) are not read.
 */
export interface UploadPutTarget {
    url: string;
    headers: Record<string, string>;
}

/** One upload as the server reports it. `id` is absent only for a slot rejected at `start`. */
export interface UploadMirror {
    id?: string;
    status: UploadStatusMirror;
    /** Human-readable detail when `failed`. Branch on `status`, never on this string. */
    error?: string;
}

/** One slot of `upload.start`'s answer — same position as the slot that asked. */
export interface UploadTicketMirror {
    upload: UploadMirror;
    transfer?: UploadPutTarget;
    thumbnailTransfer?: UploadPutTarget;
}

export interface UploadStartResultMirror {
    list: UploadTicketMirror[];
}

export interface UploadCompleteResultMirror {
    list: UploadMirror[];
}

/**
 * The answer did not have the shape the mirror promises. It fails the socket operation as a whole
 * — the caller cannot tell which slot, if any, the server meant — never a single slot.
 *
 * The message names the offending path only. It never echoes a value: a malformed ticket may still
 * hold a signed URL.
 */
export class UploadResponseShapeError extends Error {
    constructor(operation: 'start' | 'complete', path: string) {
        super(`upload.${operation} answered with an unexpected shape at ${path}`);
        this.name = 'UploadResponseShapeError';
    }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const readUpload = (value: unknown, operation: 'start' | 'complete', path: string): UploadMirror => {
    if (!isRecord(value)) throw new UploadResponseShapeError(operation, path);
    const { id, status, error } = value;
    if (!UPLOAD_STATUSES.includes(status as UploadStatusMirror)) {
        throw new UploadResponseShapeError(operation, `${path}.status`);
    }
    if (id !== undefined && typeof id !== 'string') throw new UploadResponseShapeError(operation, `${path}.id`);
    // Anything but `failed` must name the upload it is about, or there is nothing to PUT or send.
    if (status !== 'failed' && !id) throw new UploadResponseShapeError(operation, `${path}.id`);
    return {
        ...(id ? { id } : {}),
        status: status as UploadStatusMirror,
        ...(typeof error === 'string' ? { error } : {}),
    };
};

const readPutTarget = (value: unknown, path: string): UploadPutTarget | undefined => {
    if (value === undefined || value === null) return undefined;
    if (!isRecord(value) || typeof value['url'] !== 'string' || !isRecord(value['headers'])) {
        // An inline transfer (no url) lands here too: the socket surface fixes presigned PUT, so a
        // ticket without a destination is a broken answer, not a different way to send.
        throw new UploadResponseShapeError('start', path);
    }
    const headers: Record<string, string> = {};
    for (const [name, header] of Object.entries(value['headers'])) {
        if (typeof header !== 'string') throw new UploadResponseShapeError('start', `${path}.headers`);
        headers[name] = header;
    }
    return { url: value['url'], headers };
};

const readList = (value: unknown, operation: 'start' | 'complete'): unknown[] => {
    if (!isRecord(value) || !Array.isArray(value['list'])) throw new UploadResponseShapeError(operation, 'list');
    return value['list'];
};

/** Narrows `upload.start`'s answer to the mirror, copying only the fields the mirror names. */
export const parseUploadStartResult = (value: unknown): UploadStartResultMirror => ({
    list: readList(value, 'start').map((ticket, index) => {
        const path = `list[${index}]`;
        if (!isRecord(ticket)) throw new UploadResponseShapeError('start', path);
        const transfer = readPutTarget(ticket['transfer'], `${path}.transfer`);
        const thumbnailTransfer = readPutTarget(ticket['thumbnailTransfer'], `${path}.thumbnailTransfer`);
        return {
            upload: readUpload(ticket['upload'], 'start', `${path}.upload`),
            ...(transfer ? { transfer } : {}),
            ...(thumbnailTransfer ? { thumbnailTransfer } : {}),
        };
    }),
});

/** Narrows `upload.complete`'s answer to the mirror. Every entry must carry the id it settles. */
export const parseUploadCompleteResult = (value: unknown): UploadCompleteResultMirror => ({
    list: readList(value, 'complete').map((item, index) => {
        const upload = readUpload(item, 'complete', `list[${index}]`);
        if (!upload.id) throw new UploadResponseShapeError('complete', `list[${index}].id`);
        return upload;
    }),
});

/**
 * One prepared output — the shape `prepareImage`'s `CHAT_ATTACHMENT` policy returns, mirrored here
 * because this data layer does not depend on the UI library that owns image preparation. The
 * caller binds the real preparer into the `prepare` port.
 */
export interface PreparedFileMirror {
    file: File;
    /** 0 when the source could not be measured. */
    width: number;
    height: number;
}

export interface PreparedImageMirror {
    original: PreparedFileMirror;
    /** `null` when no preview could be made; the original still goes up. */
    thumbnail: PreparedFileMirror | null;
}

/**
 * What one PUT came back with. The port reports; it never judges — success, re-issue and retry
 * are decided in one place (`sendImageMessage`) so the web, native and fallback senders cannot
 * drift apart.
 */
export type PutResult =
    | { kind: 'responded'; httpStatus: number; providerCode?: string }
    | { kind: 'no-response'; reason: 'network' | 'source' | 'system' };

/** Sends `file` to `target`. `label` is a log-safe name for the payload, e.g. `slot-2/thumbnail`. */
export type PutPort = (target: UploadPutTarget, file: File, label: string) => Promise<PutResult>;

/**
 * Everything the send sequence touches outside itself. Binding them is the caller's job — the hook
 * wires repository methods and the shell's PUT sender — so the sequence stays testable with fakes.
 */
export interface SendImagePorts {
    prepare(file: File): Promise<PreparedImageMirror>;
    start(input: UploadStartInput): Promise<UploadStartResultMirror>;
    complete(input: UploadCompleteInput): Promise<UploadCompleteResultMirror>;
    put: PutPort;
    /** Sends the message with the stored uploads, in picking order, and settles the pending row. */
    send(input: { uploadIds: string[] }): Promise<unknown>;
}

export type { PendingUploadSlot };

/**
 * Tells a pending slot from a server upload in the same `upload$$` list. The local slot type lives
 * with the cache contract, because the storage port is typed by it; the guard lives here, with the
 * rest of the send sequence's vocabulary.
 */
export const isPendingUploadSlot = (slot: unknown): slot is PendingUploadSlot =>
    typeof slot === 'object' && slot !== null && 'localStatus' in slot;
