import type { ShellOrBrowser } from './ports';

export type PendingReport = {
    id: string;
    category: string;
    message?: string;
    stack?: string;
    detectedAt: number;
    extra?: unknown;
};

export type BootWebMarks = {
    mainStartMs?: number;
    appRenderMs?: number;
    sessionInitializedMs?: number;
};

export type BootWebNavigation = {
    ttfbMs: number;
    responseEndMs: number;
    domContentLoadedMs: number;
    loadEndMs: number;
};

export type BootWebAsset = {
    name: string;
    transferSize: number;
    durationMs: number;
    fromCache: boolean;
};

export type BootMetricsSnapshot = {
    marks: BootWebMarks;
    navigation?: BootWebNavigation | null;
    assets?: BootWebAsset[];
    webVersion?: string;
};

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
    send(snapshot: BootMetricsSnapshot): void;
}

export interface PendingReportQueue {
    fetch(): Promise<PendingReport[]>;
    ack(ids: string[]): Promise<void>;
}
