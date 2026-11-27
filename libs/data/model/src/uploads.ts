import type { PendingUploadSlot } from '@chatic/bridge-messages';
import type {
    UploadCompleteResult,
    UploadDirectTransfer,
    UploadStartResult,
    UploadStatus,
    UploadTicket,
} from '@lemoncloud/chatic-socials-api';
import type { UploadCompleteInput, UploadStartInput } from '@lemoncloud/chatic-sockets-lib';

type Upload = UploadTicket['upload'];

export type CheckedUpload = Pick<Upload, 'id' | 'status' | 'error'>;

const UPLOAD_STATUSES: Record<UploadStatus, true> = { pending: true, stored: true, failed: true };

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

export type UploadPutTarget = Pick<UploadDirectTransfer, 'url' | 'headers'>;

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
    if (status !== 'failed' && !id) throw new UploadResponseShapeError(operation, `${path}.id`);
    return {
        ...(id ? { id } : {}),
        status,
        ...(typeof error === 'string' ? { error } : {}),
    };
};

const readDirectTransfer = (value: unknown, path: string): UploadDirectTransfer | undefined => {
    if (value === undefined || value === null) return undefined;
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
        headers: Object.fromEntries(entries) as Record<string, string>,
        maxBytes,
        ...(expiresAt !== undefined ? { expiresAt } : {}),
    };
};

const readList = (value: unknown, operation: 'start' | 'complete'): unknown[] => {
    if (!isRecord(value) || !Array.isArray(value['list'])) throw new UploadResponseShapeError(operation, 'list');
    return value['list'];
};

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

export const parseUploadCompleteResult = (value: unknown): CheckedUploadCompleteResult => ({
    list: readList(value, 'complete').map((item, index) => {
        const upload = readUpload(item, 'complete', `list[${index}]`);
        if (!upload.id) throw new UploadResponseShapeError('complete', `list[${index}].id`);
        return upload;
    }),
});

export interface ShellFileRef {
    readonly uri: string;
    readonly name: string;
    readonly type: string;
    readonly size: number;
    readonly kind: 'video' | 'file';
    readonly needsExport?: boolean;
}

export type ChatAttachmentSource = File | ShellFileRef;

export const isShellFileRef = (source: unknown): source is ShellFileRef =>
    typeof source === 'object' &&
    source !== null &&
    !(typeof Blob !== 'undefined' && source instanceof Blob) &&
    typeof (source as { uri?: unknown }).uri === 'string';

export interface PreparedFileMirror<S extends ChatAttachmentSource = File> {
    file: S;
    width: number;
    height: number;
}

export interface PreparedImageMirror<S extends ChatAttachmentSource = File> {
    original: PreparedFileMirror<S>;
    thumbnail: PreparedFileMirror<S> | null;
}

export type PutResult =
    | { kind: 'responded'; httpStatus: number; providerCode?: string }
    | { kind: 'no-response'; reason: 'network' | 'source' | 'system' };

export type PutProgress = (sentBytes: number) => void;

export type PutPort = (
    target: UploadPutTarget,
    file: File,
    label: string,
    onProgress?: PutProgress,
    signal?: AbortSignal
) => Promise<PutResult>;

export type ShellFilePutPort = (
    target: UploadPutTarget,
    file: ShellFileRef,
    label: string,
    onProgress?: PutProgress
) => Promise<PutResult>;

export interface SendImagePorts<S extends ChatAttachmentSource = File> {
    prepare(file: S): Promise<PreparedImageMirror<S>>;
    start(input: UploadStartInput): Promise<PresignedUploadStartResult>;
    complete(input: UploadCompleteInput): Promise<CheckedUploadCompleteResult>;
    put: (target: UploadPutTarget, file: S, label: string, onProgress?: PutProgress) => Promise<PutResult>;
    send(input: { uploadIds: string[] }): Promise<unknown>;
}

export type { PendingUploadSlot };

export const isPendingUploadSlot = (slot: unknown): slot is PendingUploadSlot =>
    typeof slot === 'object' && slot !== null && 'localStatus' in slot;
