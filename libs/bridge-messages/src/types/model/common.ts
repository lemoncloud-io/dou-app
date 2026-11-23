export type Platform = 'ios' | 'android' | 'windows' | 'macos' | 'web';

export type AppLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type AppLogOrigin = 'web' | 'native';

export type AppLogStructuredFields = {
    kind?: 'log' | 'trace' | 'sample' | 'event';
    httpStatus?: number;
    errorCode?: string;
    durationMs?: number;
    attrs?: Record<string, string>;
    metrics?: Record<string, number>;
    sr?: number;
    pv?: number;
    seq?: number;
};

export type AppLogInfo = AppLogStructuredFields & {
    id?: string;
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
    sessionId?: string;
    platform?: string;
    host?: string;
    network?: string;
    locale?: string;
    routeTemplate?: string;
    sessionOwner?: string;
    tag: string;
    message?: string;
    data?: unknown;
    timestamp?: number;
    level?: AppLogLevel;
    error?: unknown;
    source?: AppLogOrigin;
};

export type SendLogPayload = AppLogStructuredFields & {
    id?: string;
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
    sessionId?: string;
    platform?: string;
    host?: string;
    network?: string;
    locale?: string;
    routeTemplate?: string;
    sessionOwner?: string;
    level?: AppLogLevel;
    tag?: string;
    message: string;
    data?: unknown;
    error?: unknown;
    timestamp?: number;
    source?: AppLogOrigin;
};

export type OnSendLogPayload = {};

export type FetchLogUploadQueuePayload = {
    limit?: number;
};

export type OnFetchLogUploadQueuePayload = {
    logs: AppLogInfo[];
    size: number;
};

export type AckLogUploadQueuePayload = {
    ids: string[];
};

export type OnAckLogUploadQueuePayload = {
    size: number;
};

export type ClearLogUploadQueuePayload = {};

export type OnClearLogUploadQueuePayload = {
    size: number;
};

export type PendingReportInfo = {
    id: string;
    category: string;
    message?: string;
    stack?: string;
    detectedAt: number;
    extra?: unknown;
};

export type FetchPendingReportsPayload = {};

export type OnFetchPendingReportsPayload = {
    reports: PendingReportInfo[];
};

export type AckPendingReportsPayload = {
    ids: string[];
};

export type OnAckPendingReportsPayload = {
    size: number;
};
