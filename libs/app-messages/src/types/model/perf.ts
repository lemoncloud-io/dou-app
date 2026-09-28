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
 * app's own Boot Performance screen was the only viewer (ADR-0080 decision 11 moves that to the web).
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

/**
 * [Request] Start a Firebase Performance trace in the native shell.
 *
 * Firebase times a trace itself, from its start call to its stop call, and only the native SDK
 * can record one — so the WebView sends the start the moment its measurement begins rather than a
 * finished duration afterwards. `name` is one of `@chatic/perf`'s `PerfTraceName`s, typed as a
 * string here so this contracts package does not depend on the one that produces it.
 */
export type StartPerfTracePayload = {
    /** Pairs this start with its `StopPerfTrace`. */
    id: string;
    name: string;
};

/** [Response] StartPerfTrace ack. */
export type OnStartPerfTracePayload = {
    // Empty object type, reserved for future extension.
};

/**
 * [Request] Stop a trace started by `StartPerfTrace`, or one the native shell started itself and
 * handed over through `OnNavigate.perfTrace`. An id the native side does not hold is ignored.
 */
export type StopPerfTracePayload = {
    id: string;
    name: string;
    /** Already within Firebase's attribute limits — `@chatic/perf` enforces them at the source. */
    attributes: Record<string, string>;
    /** Integer values, already within Firebase's metric limits. */
    metrics: Record<string, number>;
};

/** [Response] StopPerfTrace ack. */
export type OnStopPerfTracePayload = {
    // Empty object type, reserved for future extension.
};

/**
 * A trace the native shell started and the WebView is expected to stop — the room-open trace a
 * notification tap begins. Rides on the navigation it caused.
 */
export type HandedOverPerfTrace = {
    id: string;
    /** Epoch ms of the native start. Wall clock, because the two runtimes share no other clock. */
    startedAt: number;
    /**
     * What opened it. `push_tap` is a tap the notification library reported as one; `deeplink` is
     * an OS link, which on Android includes a tap on a notification the app drew itself — that
     * tap reaches JS as a plain URL and cannot be told apart here.
     */
    entry: 'push_tap' | 'deeplink';
    /**
     * Whether the tap launched the app. The trace starts once the tap reaches JS, after the launch,
     * so this separates opens that followed a cold boot rather than including the boot itself.
     */
    coldStart: boolean;
};
