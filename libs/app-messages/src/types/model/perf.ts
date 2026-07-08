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
