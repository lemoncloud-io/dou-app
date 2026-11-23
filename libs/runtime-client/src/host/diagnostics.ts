import type { PendingReportInfo, SendBootMetricsPayload } from '@chatic/bridge-messages';

import type { ShellOrBrowser } from './ports';

export interface DiagnosticsPort {
    readonly kind: ShellOrBrowser;
    readonly entry: DiagnosticsEntry;
    readonly debugMode: HostDebugMode | null;
    readonly bootMetrics: BootMetricsSink | null;
    readonly pendingReports: PendingReportQueue | null;
}

export type DiagnosticsEntry = 'icon' | 'browser';

export interface HostDebugMode {
    set(enabled: boolean): void;
}

export interface BootMetricsSink {
    send(snapshot: SendBootMetricsPayload): void;
}

export interface PendingReportQueue {
    fetch(): Promise<PendingReportInfo[]>;
    ack(ids: string[]): Promise<void>;
}
