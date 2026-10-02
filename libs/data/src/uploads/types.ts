/**
 * The upload answers' types, their runtime guard, and the ports the image send sequence runs on.
 *
 * **Why a guard, now that the types are real.** The answer types come from the upload contract
 * (`lemon-model/upload`), re-exported by `@lemoncloud/chatic-socials-api`. But the socket gateway's
 * `start<T>` / `complete<T>` return whatever came over the wire cast to `T`: the types say what the
 * server promises, not what arrived. The guard below is the one place an answer becomes a typed
 * value, and it fails the whole operation when the answer breaks the contract.
 */

import type { PendingUploadSlot } from '@chatic/app-messages';
import type {
    UploadCompleteResult,
    UploadDirectTransfer,
    UploadStartResult,
    UploadStatus,
    UploadTicket,
} from '@lemoncloud/chatic-socials-api';
import type { UploadCompleteInput, UploadStartInput } from '@lemoncloud/chatic-sockets-lib';

/** One upload as the server reports it. The SDK does not re-export the contract's `Upload` by name. */
type Upload = UploadTicket['upload'];

/**
 * The part of an `Upload` the guard checks and keeps. It is assignable to `Upload`, but it does not
 * claim the fields the guard drops: a `stored` upload here has no `url`, which the full type would
 * promise.
 */
export type CheckedUpload = Pick<Upload, 'id' | 'status' | 'error'>;

/**
 * A key per contract status, so a status the contract adds fails to compile here instead of being
 * rejected at runtime as an unknown one.
 */
const UPLOAD_STATUSES: Record<UploadStatus, true> = { pending: true, stored: true, failed: true };

/**
 * One slot of `upload.start`'s answer as the socket surface issues it. The contract allows an inline
 * transfer too, but the socket surface has no `send` operation, so presigned PUT is the only kind a
 * client here can execute. The guard rejects any other.
 */
export interface PresignedUploadTicket extends UploadTicket {
    upload: CheckedUpload;
    transfer?: UploadDirectTransfer;
}

export interface PresignedUploadStartResult extends UploadStartResult {
    list: PresignedUploadTicket[];
}

export interface CheckedUploadCompleteResult extends UploadCompleteResult {
    list: CheckedUpload[];
}

/**
 * What a PUT sender needs from a transfer: where to send and what to send with it. **`url` and
 * `headers` are credentials** — never log them, persist them, or put them in an error message.
 */
export type UploadPutTarget = Pick<UploadDirectTransfer, 'url' | 'headers'>;

/**
 * The answer broke the upload contract. It fails the socket operation as a whole — the caller
 * cannot tell which slot, if any, the server meant — never a single slot.
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

const isUploadStatus = (value: unknown): value is UploadStatus =>
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(UPLOAD_STATUSES, value);

const readUpload = (value: unknown, operation: 'start' | 'complete', path: string): CheckedUpload => {
    if (!isRecord(value)) throw new UploadResponseShapeError(operation, path);
    const { id, status, error } = value;
    if (!isUploadStatus(status)) throw new UploadResponseShapeError(operation, `${path}.status`);
    if (id !== undefined && typeof id !== 'string') throw new UploadResponseShapeError(operation, `${path}.id`);
    // Anything but `failed` must name the upload it is about, or there is nothing to PUT or send.
    if (status !== 'failed' && !id) throw new UploadResponseShapeError(operation, `${path}.id`);
    return {
        ...(id ? { id } : {}),
        status,
        ...(typeof error === 'string' ? { error } : {}),
    };
};

const readDirectTransfer = (value: unknown, path: string): UploadDirectTransfer | undefined => {
    if (value === undefined || value === null) return undefined;
    // An inline transfer lands here too: without a `send` operation on the socket surface, a ticket
    // this client cannot PUT is a broken answer, not a different way to send.
    if (!isRecord(value) || value['kind'] !== 'presigned-put') throw new UploadResponseShapeError('start', path);
    const { method, url, headers, maxBytes, expiresAt } = value;
    if (method !== 'PUT') throw new UploadResponseShapeError('start', `${path}.method`);
    if (typeof url !== 'string') throw new UploadResponseShapeError('start', `${path}.url`);
    if (!isRecord(headers)) throw new UploadResponseShapeError('start', `${path}.headers`);
    if (typeof maxBytes !== 'number') throw new UploadResponseShapeError('start', `${path}.maxBytes`);
    if (expiresAt !== undefined && typeof expiresAt !== 'number') {
        throw new UploadResponseShapeError('start', `${path}.expiresAt`);
    }
    const entries = Object.entries(headers);
    if (entries.some(([, header]) => typeof header !== 'string')) {
        throw new UploadResponseShapeError('start', `${path}.headers`);
    }
    return {
        kind: 'presigned-put',
        method: 'PUT',
        url,
        // `fromEntries` defines each name as an own property, so not even a `__proto__` header is lost.
        headers: Object.fromEntries(entries) as Record<string, string>,
        maxBytes,
        ...(expiresAt !== undefined ? { expiresAt } : {}),
    };
};

const readList = (value: unknown, operation: 'start' | 'complete'): unknown[] => {
    if (!isRecord(value) || !Array.isArray(value['list'])) throw new UploadResponseShapeError(operation, 'list');
    return value['list'];
};

/**
 * Narrows `upload.start`'s answer to the contract, copying only the fields it checks: an upload's
 * `id` · `status` · `error`, and every field of a presigned PUT. What the server adds on top (the
 * echoed declaration, `stereo`, …) is dropped, because nothing here reads it.
 */
export const parseUploadStartResult = (value: unknown): PresignedUploadStartResult => ({
    list: readList(value, 'start').map((ticket, index) => {
        const path = `list[${index}]`;
        if (!isRecord(ticket)) throw new UploadResponseShapeError('start', path);
        const transfer = readDirectTransfer(ticket['transfer'], `${path}.transfer`);
        const thumbnailTransfer = readDirectTransfer(ticket['thumbnailTransfer'], `${path}.thumbnailTransfer`);
        return {
            upload: readUpload(ticket['upload'], 'start', `${path}.upload`),
            ...(transfer ? { transfer } : {}),
            ...(thumbnailTransfer ? { thumbnailTransfer } : {}),
        };
    }),
});

/**
 * Narrows `upload.complete`'s answer to the contract. The contract lets an upload omit its `id`
 * only when `start` rejected it, so every entry here must carry the id it settles.
 */
export const parseUploadCompleteResult = (value: unknown): CheckedUploadCompleteResult => ({
    list: readList(value, 'complete').map((item, index) => {
        const upload = readUpload(item, 'complete', `list[${index}]`);
        if (!upload.id) throw new UploadResponseShapeError('complete', `list[${index}].id`);
        return upload;
    }),
});

/**
 * A file the shell keeps in its own folder. The page holds its address and details, never its bytes:
 * a 300MB video does not fit through the bridge, so the shell picks it, keeps it, and uploads it
 * from there. Only an app that has the attachment picker makes one.
 */
export interface ShellFileRef {
    /** `file://` inside the shell's attach-pick folder. */
    readonly uri: string;
    /** With the format's extension (`chatAttachmentFormat`), unless `needsExport`. */
    readonly name: string;
    /** The declared content type. */
    readonly type: string;
    readonly size: number;
    /**
     * The attachment this file belongs to. A video's poster carries `'video'` too: it is that slot's
     * thumbnail, not an attachment of its own.
     */
    readonly kind: 'video' | 'file';
    /**
     * An iOS video not yet written as an H.264 `mp4`. Its name, type and size are the source's until
     * the shell has converted it (`PrepareVideo`), so the size is judged again after that.
     */
    readonly needsExport?: boolean;
}

/** What a pick hands the send: a page file, or a file the shell keeps. */
export type ChatAttachmentSource = File | ShellFileRef;

/** Tells a shell file from a page `File`. A `File` has no `uri`, and a shell file is never a `Blob`. */
export const isShellFileRef = (source: unknown): source is ShellFileRef =>
    typeof source === 'object' &&
    source !== null &&
    !(typeof Blob !== 'undefined' && source instanceof Blob) &&
    typeof (source as { uri?: unknown }).uri === 'string';

/**
 * One prepared output — the shape `prepareImage`'s `CHAT_ATTACHMENT` policy returns, mirrored here
 * because this data layer does not depend on the UI library that owns image preparation. The
 * caller binds the real preparer into the `prepare` port. A shell video's original and poster are
 * shell files; everything else is a page `File`.
 */
export interface PreparedFileMirror<S extends ChatAttachmentSource = File> {
    file: S;
    /** 0 when the source could not be measured. */
    width: number;
    height: number;
}

export interface PreparedImageMirror<S extends ChatAttachmentSource = File> {
    original: PreparedFileMirror<S>;
    /** `null` when no preview could be made, or none is wanted (a GIF); the original still goes up. */
    thumbnail: PreparedFileMirror<S> | null;
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

/** Sends a file the shell keeps, from where it lies. Only the native transfer can. */
export type ShellFilePutPort = (target: UploadPutTarget, file: ShellFileRef, label: string) => Promise<PutResult>;

/**
 * Everything the send sequence touches outside itself. Binding them is the caller's job — the hook
 * wires repository methods and the shell's PUT sender — so the sequence stays testable with fakes.
 *
 * `S` is what a pick and its prepared files are: page files by default, which every shell can PUT.
 * A caller that also sends shell files widens it to `ChatAttachmentSource`, and its `put` then has to
 * take both — a shell file's original and poster reach it as the shell files they are.
 */
export interface SendImagePorts<S extends ChatAttachmentSource = File> {
    prepare(file: S): Promise<PreparedImageMirror<S>>;
    start(input: UploadStartInput): Promise<PresignedUploadStartResult>;
    complete(input: UploadCompleteInput): Promise<CheckedUploadCompleteResult>;
    put: (target: UploadPutTarget, file: S, label: string) => Promise<PutResult>;
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
