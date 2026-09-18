/** Supported platform types */
export type Platform = 'ios' | 'android' | 'windows' | 'macos' | 'web';

/** App log level */
export type AppLogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Runtime where the log originated — recorded only when crossing the boundary (ADR-0097) */
export type AppLogOrigin = 'web' | 'native';

/** App log entry structure */
export type AppLogInfo = {
    /**
     * Entry-unique id — the server dedup key. In the hybrid app, a web log lands in both
     * its own queue and the native buffer, and the uploader pulls from that buffer again,
     * so without this value the same log gets stored as two separate documents. With it,
     * the document id upsert merges them into one.
     */
    id?: string;
    /** Context captured at occurrence — the lookup axis for batch upload. May differ from the value at save time, so it's captured at the moment the log happens */
    runId?: string;
    sid?: string;
    uid?: string;
    cid?: string;
    appVersion?: string;
    webVersion?: string;
    route?: string;
    os?: string;
    osVersion?: string;
    model?: string;
    tag: string; // Log identifying tag
    message?: string; // Log message
    data?: unknown; // Attached data
    timestamp?: number; // Time of occurrence (ms)
    level?: AppLogLevel; // Log level
    error?: unknown; // Error object
    source?: AppLogOrigin; // Runtime of origin (when it crosses a boundary)
};

/** [Request] Web -> App log delivery payload */
export type SendLogPayload = {
    /** Entry-unique id — server dedup key (filled in by the receiver if absent) */
    id?: string;
    /** Context captured at occurrence — the lookup axis for batch upload. May differ from the value at save time, so it's captured at the moment the log happens */
    runId?: string;
    sid?: string;
    uid?: string;
    cid?: string;
    appVersion?: string;
    webVersion?: string;
    route?: string;
    os?: string;
    osVersion?: string;
    model?: string;
    level?: AppLogLevel;
    tag?: string;
    message: string;
    data?: unknown;
    error?: unknown;
    /** Time of occurrence (ms) — if absent (older web build), the receiver falls back to the receipt time (ADR-0097) */
    timestamp?: number;
    /** Runtime of origin — the web forwarder stamps this as 'web' */
    source?: AppLogOrigin;
};

/** [Response] Web -> App log delivery completion payload */
export type OnSendLogPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/**
 * The 4 log-buffer message pairs — **deprecated, kept only for compatibility.**
 *
 * The ring buffer these messages used to read from is gone; the pending-upload queue
 * (`FetchLogUploadQueue`) is now the sole log store. The types and app handlers remain
 * because **web ships ahead of the app** — a web build predating this change, still
 * installed alongside the latest app, keeps sending these messages. Removing the handler
 * would turn it into `NOT_FOUND`, which shows that side's debug screen as failing, so the
 * app returns an empty result instead.
 *
 * Once no deployed web build calls these anymore, delete all 4 pairs.
 */
/** [Request] Fetch log buffer payload (deprecated — returns empty result) */
export type FetchAppLogBufferPayload = {
    count?: number;
};

/** [Request] Poll log buffer payload (deprecated — returns empty result, removes nothing) */
export type PollAppLogBufferPayload = {
    count?: number;
};

/** [Request] Clear log buffer payload (deprecated — no-op) */
export type ClearAppLogBufferPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Request] Fetch log buffer size payload (deprecated — always 0) */
export type FetchAppLogBufferSizePayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Response] Fetch log buffer payload (deprecated — empty list) */
export type OnFetchAppLogBufferPayload = {
    logs: AppLogInfo[];
    size: number;
};

/** [Response] Poll log buffer payload (deprecated — empty list) */
export type OnPollAppLogBufferPayload = {
    logs: AppLogInfo[];
    size: number;
};

/** [Response] Clear entire log buffer payload (deprecated) */
export type OnClearAppLogBufferPayload = {
    success: boolean;
    size: number;
};

/** [Response] Fetch log buffer size payload (deprecated — always 0) */
export type OnFetchAppLogBufferSizePayload = {
    size: number;
};

/**
 * [Request] Fetch a batch from the app upload queue (ADR-0063).
 *
 * **Non-destructive.** Returning the same entries again on a repeat call is expected
 * behavior; only `AckLogUploadQueue` releases them. If fetching also removed entries,
 * the only copy would disappear before the upload succeeds — if the process dies in
 * that window, the entry survives nowhere, losing exactly the log that matters most:
 * the one from the moment the app died.
 *
 * Since this queue is the sole log store, the debug view also reads it through this
 * message. There is no longer a destructive consumer.
 */
export type FetchLogUploadQueuePayload = {
    limit?: number;
};

/** [Response] Fetch a batch from the app upload queue (ADR-0063) */
export type OnFetchLogUploadQueuePayload = {
    logs: AppLogInfo[];
    /** Total size of the upload queue at fetch time (not the size of the returned batch) */
    size: number;
};

/** [Request] Remove successfully uploaded logs from the app upload queue (ADR-0063) */
export type AckLogUploadQueuePayload = {
    ids: string[];
};

/** [Response] App upload queue cleanup completion payload (ADR-0063) */
export type OnAckLogUploadQueuePayload = {
    /** Remaining queue size after cleanup */
    size: number;
};

/**
 * [Request] Discard the entire app upload queue (ADR-0063).
 *
 * Reserved for device opt-out only. Opt-out expresses "stop collecting on this device",
 * so letting already-queued entries still go out afterward would contradict that intent
 * — a different concern from a build flag that only stops future sending. Do not use
 * this for logout: entries carry the uid/cid captured at occurrence, so accounts never
 * mix and they're safe to keep; clearing them would lose the very entries that record
 * whatever session problem prompted the logout.
 */
export type ClearLogUploadQueuePayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Response] App upload queue discard completion payload (ADR-0063) */
export type OnClearLogUploadQueuePayload = {
    /** Size after discarding — should be 0 in the normal case */
    size: number;
};

/**
 * A report item native detected but cannot send directly (ADR-0097).
 * The `/hello/report` signing token is only held by the web session, so native queues
 * a snapshot taken at detection time (in MMKV) and web pulls it after boot to send it
 * on native's behalf.
 */
export type PendingReportInfo = {
    /** Unique id used for ack-based dedup, to prevent double-sending */
    id: string;
    /** Report category (webview-crash | native-error | native-crash) */
    category: string;
    /** Summary message (e.g. the exception message) */
    message?: string;
    /** JS stack (available for native-error, when present) */
    stack?: string;
    /** Detection time (ms) — used as the payload timestamp, not the time of the proxied send */
    detectedAt: number;
    /**
     * @deprecated Reports no longer attach logs — entries are uploaded individually by
     * the batch uploader. The field is kept because older shell builds still populate
     * and send it (web does not read it).
     */
    logs?: AppLogInfo[];
    /** Platform-specific extra info (isFatal, exit reason, etc.) */
    extra?: unknown;
};

/** [Request] Fetch the pending report queue */
export type FetchPendingReportsPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Response] Fetch the pending report queue */
export type OnFetchPendingReportsPayload = {
    reports: PendingReportInfo[];
};

/** [Request] Remove successfully sent pending reports */
export type AckPendingReportsPayload = {
    ids: string[];
};

/** [Response] Pending report cleanup completion payload */
export type OnAckPendingReportsPayload = {
    /** Remaining queue size after cleanup */
    size: number;
};
