/**
 * Boot/perf instrumentation contracts.
 *
 * The web collects its half of the boot timeline (see apps/web features/debug
 * metrics/bootMarks) and hands it to the native shell once per page load; the
 * native BootMetricsService merges it with the native milestones and persists
 * the combined record.
 */

/** Web boot milestones, in ms relative to the WebView page-load start (timeOrigin). */
export type BootWebMarks = {
    mainStartMs?: number;
    appRenderMs?: number;
    sessionInitializedMs?: number;
};

/** Navigation timing summary for the WebView document itself. */
export type BootWebNavigation = {
    ttfbMs: number;
    responseEndMs: number;
    domContentLoadedMs: number;
    loadEndMs: number;
};

/** Per-bundle resource timing — tells cache hits from network downloads. */
export type BootWebAsset = {
    name: string;
    transferSize: number;
    durationMs: number;
    fromCache: boolean;
};

/**
 * A native boot milestone. Declared here rather than in the app because the persisted record now
 * crosses the bridge (`FetchBootRecords`) — one declaration keeps the two sides from drifting, the
 * same reason `SendBootMetricsPayload` already lives here.
 */
export type NativeBootMarkKey =
    | 'provider-ready'
    | 'app-mount'
    | 'main-screen-mount'
    | 'load-start'
    | 'load-end'
    | 'web-app-ready';

/** A cold launch, or a WebView content-process reload within a live app. */
export type BootType = 'cold' | 'reload';

/** One finalized boot, native milestones merged with the web snapshot. */
export type BootRecord = {
    /** Epoch ms when the record was finalized. */
    finalizedAt: number;
    type: BootType;
    appVersion: string;
    /** Milestones relative to the session baseline. */
    native: Partial<Record<NativeBootMarkKey, number>>;
    /** Web-side snapshot (relative to the WebView page load), merged via SendBootMetrics. */
    web: SendBootMetricsPayload | null;
    /** Baseline → WebAppReady; the headline "boot took N ms" number. */
    totalMs: number | null;
};

/** [Request] Deliver the web-side boot timeline snapshot (once per page load). */
export type SendBootMetricsPayload = {
    marks: BootWebMarks;
    navigation?: BootWebNavigation | null;
    assets?: BootWebAsset[];
    webVersion?: string;
};

/** [Response] SendBootMetrics ack. */
export type OnSendBootMetricsPayload = {
    // Empty object type, reserved for future extension.
};

/**
 * [Request] Propagate the web debug-mode unlock (MyPage 10-tap) to the native
 * shell so the native debug overlay opens in PROD builds too. `enabled: false`
 * locks both sides again.
 */
export type SetDebugModePayload = {
    enabled: boolean;
};

/** [Response] SetDebugMode ack with the flag the native side persisted. */
export type OnSetDebugModePayload = {
    enabled: boolean;
};

/**
 * [Request] Read back what the native side recorded.
 *
 * `SendBootMetrics` only goes web → app, so until now nothing could read the merged records; the
 * app's own Boot Performance screen was the only viewer (ADR-0080 결정 11 moves that to the web).
 */
export type FetchBootRecordsPayload = {
    // Empty object type, reserved for future extension.
};

/** [Response] The persisted records plus the two live counters the screen shows alongside them. */
export type OnFetchBootRecordsPayload = {
    /** Newest first, capped by the native ring buffer. */
    records: BootRecord[];
    /** How many times the WebView content process reloaded in this app run. */
    contentProcessReloadCount: number;
    /** Time of the last foreground resume, or null if the app has not backgrounded yet. */
    lastForegroundResumeMs: number | null;
};

/** [Request] Drop every persisted boot record. */
export type ClearBootRecordsPayload = {
    // Empty object type, reserved for future extension.
};

/** [Response] ClearBootRecords result. */
export type OnClearBootRecordsPayload = {
    success: boolean;
};
