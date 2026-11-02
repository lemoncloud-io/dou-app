// --- File Transfer Types ---
//
// The web hands the native shell a transfer instruction (a signed URL plus the headers it covers);
// the native side moves the bytes, keeps going in the background, and reports back. The contract is
// direction-neutral on purpose: a download is one more `direction` value on the same five messages,
// not a second set of message names.

/**
 * Which way the bytes move.
 * - `upload`: from `file.uri` to `url`.
 * - `download`: from `url` into a file the shell creates in a folder it owns. The terminal event
 *   carries that file's URI.
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
 * - `SOURCE`: the local file could not be used — for an upload it could not be opened or read, for
 *   a download it could not be written (a full disk, for example).
 * - `INVALID`: the request itself is wrong — missing field, duplicate id, a method or file that does
 *   not fit the direction, or an operation on a transfer that already ended.
 * - `SYSTEM`: the OS stopped the transfer (for example the Android data-sync time limit). The app
 *   may start it again once it is back in the foreground.
 * - `INTERNAL`: anything else.
 */
export type FileTransferErrorCode = 'NETWORK' | 'SOURCE' | 'INVALID' | 'SYSTEM' | 'INTERNAL';

/** Fields every start request carries, whichever way the bytes move. */
type StartFileTransferCommon = {
    /**
     * Chosen by the caller (a UUID). Must not be reused while the shell still holds it. A download
     * whose id is reused after acknowledgement starts from an empty folder: the earlier file is gone.
     */
    transferId: string;
    /** Signed URL. Never persisted or logged by the shell; only its host appears in logs. */
    url: string;
    /** Sent as given, except the headers the platform owns (`content-length`, `host`). */
    headers?: Record<string, string>;
    /** Name shown in the system notification. Falls back to a direction-specific default. Never a URL or path. */
    title?: string;
};

/** [Request] Start an upload: read `file.uri` and send it to `url`. */
export type StartUploadPayload = StartFileTransferCommon & {
    direction: 'upload';
    method: 'PUT';
    file: {
        /** The file to read. */
        uri: string;
        contentType?: string;
        /** Required — it is the progress denominator. */
        contentLength?: number;
    };
};

/**
 * [Request] Start a download: fetch `url` into a file the shell creates.
 *
 * Where the file goes is the shell's decision, not the caller's. The web bundle is loaded remotely,
 * and a caller that could name the target path could overwrite the app's own database or settings,
 * so a request that carries `file.uri` is refused with `INVALID`. The shell always asks for the
 * body unencoded (`Accept-Encoding: identity`), so the bytes it keeps are the stored object's.
 */
export type StartDownloadPayload = StartFileTransferCommon & {
    direction: 'download';
    method: 'GET';
    file?: {
        /**
         * A file name hint. The shell drops path segments and control characters, shortens it, and
         * replaces the extension with the one the bytes show when they are a known image type.
         */
        name?: string;
    };
};

/**
 * [Request] Start a transfer. A successful envelope means "accepted", not "done" — results arrive as
 * events. Refused with `INVALID`: a reused id, a URL that is not an absolute http(s) URL, a method
 * that does not match the direction (`upload` needs `PUT`, `download` needs `GET`), and a `download`
 * that names `file.uri`.
 */
export type StartFileTransferPayload = StartUploadPayload | StartDownloadPayload;

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
    /**
     * `download` only, and only when it ended `responded` with a 2xx `httpStatus` — any other
     * response leaves no file behind. The local file the shell wrote, to hand as is to
     * `SaveToPhotoLibrary` or `ShareFile`. Held with the rest of the result until acknowledged, so a
     * WebView that reloaded meanwhile finds it again through `ListFileTransfers`.
     */
    file?: DownloadedFile;
};

/** A file a download wrote into the shell's download folder. */
export type DownloadedFile = {
    /** `file://` URI inside the shell's download folder. */
    uri: string;
    /** Size in bytes. */
    size: number;
    /**
     * The response's `Content-Type`, carried as is. It is what the uploader declared, so nothing
     * decides on it — `SaveToPhotoLibrary` and `ShareFile` read the file's bytes instead.
     */
    contentType?: string;
};
