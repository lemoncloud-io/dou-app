/**
 * The traces this app records.
 *
 * A closed union on purpose. A trace name is a row in the Firebase console, and a console
 * alert is configured against that exact string, so a typo at a call site must not quietly
 * open a second row that nobody is watching. Snake case because it is the one spelling both
 * the Firebase console and a log query accept without escaping.
 */
export type PerfTraceName =
    | 'boot'
    | 'cloud_switch'
    | 'site_switch'
    | 'web_vitals'
    | 'chat_room_open'
    | 'chat_room_sync'
    | 'bridge_request'
    | 'chat_send'
    | 'socket_verify'
    | 'first_screen'
    | 'socket_request'
    | 'chat_send_media';

/** What a backend learns when a trace starts. */
export interface PerfTraceStart {
    /**
     * Correlates the start with its stop across a runtime boundary. A trace started in the
     * native shell is stopped from the WebView, so the id — not an object reference — is what
     * the two halves share.
     */
    id: string;
    name: PerfTraceName;
}

/** What a backend receives when a trace stops. */
export interface PerfTraceResult extends PerfTraceStart {
    /**
     * Elapsed ms as the handle measured it. A backend that times the trace itself (Firebase)
     * ignores this; a backend that only sees the end (the log fallback) has nothing else.
     */
    durationMs: number;
    /** Low-cardinality dimensions, already within Firebase's limits. */
    attributes: Record<string, string>;
    /** Integer values, already within Firebase's limits. */
    metrics: Record<string, number>;
}
