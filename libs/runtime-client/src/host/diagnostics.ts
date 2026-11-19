import type { PendingReportInfo, SendBootMetricsPayload } from '@chatic/bridge-messages';

import type { ShellOrBrowser } from './ports';

/**
 * Where the page's diagnostics go: its logs and their upload, the telemetry entry point, issue
 * reports and boot metrics. `shell` — through the app, which queues logs and reports and was the
 * entry point (its icon); `browser` — the page sends its own, and was opened in a browser.
 *
 * What only the app has — its own debug switch, a boot record, a queue of reports from runs that died
 * — is a member that is `null` where the page sends its own, so a feature asks for the member, not for
 * the side.
 */
export interface DiagnosticsPort {
    readonly kind: ShellOrBrowser;
    /**
     * How this run was entered, as the usage session's `entry` names it: `icon` — the app was opened
     * from its icon and the page runs inside it; `browser` — the page was opened in a browser. A name,
     * not a behaviour: statistics group sessions by it.
     */
    readonly entry: DiagnosticsEntry;
    /**
     * The app's own debug switch, which covers its native layers — and, on the phone, PROD builds too —
     * so one unlock or lock on the page reaches both. `null` where the page's own unlock record is the
     * only one.
     */
    readonly debugMode: HostDebugMode | null;
    /**
     * Where the page's boot timeline goes, to be merged with the app's half into one record. `null`
     * where nothing keeps such a record.
     */
    readonly bootMetrics: BootMetricsSink | null;
    /**
     * The app's queue of reports it detected while the page was gone or dying — a WebView crash, a
     * native exception — for the page to send on its behalf. `null` where nothing queues them.
     */
    readonly pendingReports: PendingReportQueue | null;
}

/** How a run was entered, in the usage session's own words. */
export type DiagnosticsEntry = 'icon' | 'browser';

/** The app's debug switch. */
export interface HostDebugMode {
    /** Unlocks or locks the app's debug tools, and records it where a restarted page reads it at boot. */
    set(enabled: boolean): void;
}

/** The receiver of the page's boot timeline. */
export interface BootMetricsSink {
    /** Hands over this page load's boot snapshot. Fire-and-forget; send it once per load. */
    send(snapshot: SendBootMetricsPayload): void;
}

/** The app's queue of reports waiting to be sent. */
export interface PendingReportQueue {
    /** The reports still queued; none where the app could not answer. Rejects if the request fails. */
    fetch(): Promise<PendingReportInfo[]>;
    /** Drops the reports with these ids from the queue, so it never hands them over again. */
    ack(ids: string[]): Promise<void>;
}
