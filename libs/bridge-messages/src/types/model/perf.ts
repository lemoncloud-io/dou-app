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

export type NativeBootMarkKey =
    | 'provider-ready'
    | 'app-mount'
    | 'main-screen-mount'
    | 'load-start'
    | 'load-end'
    | 'web-app-ready';

export type BootType = 'cold' | 'reload' | 'restart';

export type BootRecord = {
    finalizedAt: number;
    type: BootType;
    appVersion: string;
    native: Partial<Record<NativeBootMarkKey, number>>;
    web: SendBootMetricsPayload | null;
    totalMs: number | null;
};

export type SendBootMetricsPayload = {
    marks: BootWebMarks;
    navigation?: BootWebNavigation | null;
    assets?: BootWebAsset[];
    webVersion?: string;
};

export type OnSendBootMetricsPayload = {};

export type SetDebugModePayload = {
    enabled: boolean;
};

export type OnSetDebugModePayload = {
    enabled: boolean;
};

export type FetchBootRecordsPayload = {};

export type OnFetchBootRecordsPayload = {
    records: BootRecord[];
    contentProcessReloadCount: number;
    lastForegroundResumeMs: number | null;
};

export type ClearBootRecordsPayload = {};

export type OnClearBootRecordsPayload = {
    success: boolean;
};

export type StartPerfTracePayload = {
    id: string;
    name: string;
};

export type OnStartPerfTracePayload = {};

export type StopPerfTracePayload = {
    id: string;
    name: string;
    attributes: Record<string, string>;
    metrics: Record<string, number>;
};

export type OnStopPerfTracePayload = {};

export type HandedOverPerfTrace = {
    id: string;
    syncId?: string;
    startedAt: number;
    entry: 'push_tap' | 'deeplink';
    coldStart: boolean;
};
