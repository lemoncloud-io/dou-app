// --- File Transfer Types ---
//
// The web hands the native shell a transfer instruction (a signed URL plus the headers it covers)
// and a local file; the native side moves the bytes, keeps going in the background, and reports
// back. The contract is direction-neutral on purpose: downloads arrive as one more `direction`
// value instead of a second set of message names.

/**
 * Which way the bytes move.
 * - `upload`: from `file.uri` to `url`.
 * - `download`: from `url` to `file.uri`. Reserved — the shell rejects it with `INVALID` until it
 *   is implemented, so a caller never gets a silent upload in its place.
 */
export type FileTransferDirection = 'upload' | 'download';

/**
 * Lifecycle of one transfer. `running` is emitted any number of times; the other three are
 * terminal and each transfer reaches exactly one of them.
 */
export type FileTransferState = 'running' | 'responded' | 'failed' | 'cancelled';

/**
 * Why a transfer ended in `failed`. Only used when no HTTP response arrived — a response of any
 * status is `responded`, and what it means is decided above the shell.
 * - `NETWORK`: connection failure, timeout, or a drop mid-transfer.
 * - `SOURCE`: the local file could not be opened or read.
 * - `INVALID`: the request itself is wrong — missing field, duplicate id, unimplemented direction,
 *   or an operation on a transfer that already ended.
 * - `SYSTEM`: the OS stopped the transfer (for example the Android data-sync time limit). The app
 *   may start it again once it is back in the foreground.
 * - `INTERNAL`: anything else.
 */
export type FileTransferErrorCode = 'NETWORK' | 'SOURCE' | 'INVALID' | 'SYSTEM' | 'INTERNAL';

/** [Request] Start a transfer. A successful envelope means "accepted", not "done" — results arrive as events. */
export type StartFileTransferPayload = {
    /** Chosen by the caller (a UUID). Must not be reused while the shell still holds it. */
    transferId: string;
    direction: FileTransferDirection;
    /** Signed URL. Never persisted or logged by the shell; only its host appears in logs. */
    url: string;
    /** `upload` accepts `PUT`, `download` accepts `GET`. */
    method: 'PUT' | 'GET';
    /** Sent as given, except the headers the platform owns (`content-length`, `host`). */
    headers?: Record<string, string>;
    file: {
        /** `upload`: the file to read. `download`: the file to write. */
        uri: string;
        contentType?: string;
        /** Required for `upload` — it is the progress denominator. `download` learns it from the response. */
        contentLength?: number;
    };
    /** Name shown in the system notification. Falls back to a direction-specific default. Never a URL or path. */
    title?: string;
};

/** [Response] The transfer was accepted. */
export type OnStartFileTransferPayload = {
    transferId: string;
};

/** [Request] Cancel a transfer. Cancelling one that already ended fails with `INVALID`. */
export type CancelFileTransferPayload = {
    transferId: string;
};

/** [Response] The cancellation was accepted. The `cancelled` event follows. */
export type OnCancelFileTransferPayload = {
    transferId: string;
};

/** [Request] Read what the shell currently holds: running transfers plus ended ones not yet acknowledged. */
export type ListFileTransfersPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Response] One entry per transfer the shell holds, in its latest state. */
export type OnListFileTransfersPayload = {
    transfers: OnFileTransferStatePayload[];
};

/**
 * [Request] Acknowledge ended transfers so the shell can drop them.
 *
 * The shell keeps a terminal result until it is acknowledged because the event announcing it can
 * be missed — the WebView may be suspended or reloading at that moment. Ids of transfers that are
 * still running are ignored.
 */
export type AckFileTransfersPayload = {
    transferIds: string[];
};

/** [Response] How many transfers the shell still holds after the acknowledgement. */
export type OnAckFileTransfersPayload = {
    remaining: number;
};

/**
 * [Request] Write bytes the web already holds to a temporary file and get its URI back.
 *
 * The transfer module only reads files, so bytes that exist only in web memory — an image the web
 * resized before upload — need a file first. The bytes cross the bridge once, as base64; the
 * transfer itself then streams from disk.
 */
export type WriteTempFilePayload = {
    base64: string;
    /** Used as the file name's suffix so the file keeps its extension. */
    fileName?: string;
};

/** [Response] The `file://` URI of the written file, in the shell's temporary directory. */
export type OnWriteTempFilePayload = {
    uri: string;
};

/** [Response - Event] State of one transfer. */
export type OnFileTransferStatePayload = {
    transferId: string;
    direction: FileTransferDirection;
    state: FileTransferState;
    /** Bytes moved so far. A byte count, not a ratio — ratios are computed across a whole batch above the shell. */
    transferredBytes: number;
    /** Total bytes. `0` means unknown. */
    totalBytes: number;
    /** `responded` only. Passed through unjudged — 403 and 412 are both `responded`. */
    httpStatus?: number;
    /** `responded` with `httpStatus >= 300`: the storage error code from the response body (S3 `<Code>`). */
    providerCode?: string;
    /** `failed` only. */
    errorCode?: FileTransferErrorCode;
    /** `failed` only: a short diagnostic string with any URL removed. */
    errorMessage?: string;
};
