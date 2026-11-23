import type { RawMockView } from '../api/reportLogApi';

export type ReportType = 'error' | 'issue' | 'log-entry' | 'unknown';

export interface ReportPayload {
    title?: string;
    message?: string;
    stack?: string;
    causes?: { message: string; stack?: string }[];
    componentStack?: string;
    app?: string;
    env?: string;
    url?: string;
    timestamp?: string;
    userAgent?: string;
    user?: Record<string, unknown>;
    cloud?: Record<string, unknown>;
    http?: {
        url?: string;
        method?: string;
        params?: unknown;
        requestBody?: unknown;
        status?: number | string;
        statusText?: string;
        code?: string;
        reason?: string;
        responseData?: unknown;
    };
    device?: Record<string, unknown>;
    network?: Record<string, unknown>;
    location?: Record<string, unknown>;
    version?: Record<string, unknown>;
    viewport?: Record<string, unknown>;
    path?: string;
    routeTrail?: unknown[];
    logs?: unknown[];
    [key: string]: unknown;
}

export interface ReportLogRow {
    id: string;
    type: ReportType;
    category?: string;
    app?: string;
    env?: string;
    title: string;
    message?: string;
    userName?: string;
    userId?: string;
    createdAt?: number;
    images?: string[];
    payload: ReportPayload | null;
    raw: unknown;
    parseError: boolean;
    level?: string;
    tag?: string;
    logData?: unknown;
    logDataRaw?: string;
    source?: string;
    runId?: string;

    timestamp?: number;
    cid?: string;
    sid?: string;
    appVersion?: string;
    webVersion?: string;
    route?: string;
    os?: string;
    osVersion?: string;
    model?: string;

    recordKind?: 'log' | 'trace' | 'sample' | 'event';
    area?: string;
    durationMs?: number;
    attrs?: Record<string, string>;
    metrics?: Record<string, number>;
    sr?: number;
    pv?: number;
    seq?: number;
    routeTemplate?: string;
    sessionId?: string;
    platform?: string;
    host?: string;
    httpStatus?: number;
    errorCode?: string;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const asObject = (value: unknown): Record<string, unknown> | undefined => {
    if (isObject(value)) return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return isObject(parsed) ? parsed : undefined;
        } catch {
            return undefined;
        }
    }
    return undefined;
};

const unwrapReport = (metaObj: Record<string, unknown>): { title?: string; payload?: Record<string, unknown> } => {
    const innerFromMessage = typeof metaObj.message === 'string' ? asObject(metaObj.message) : undefined;
    if (typeof metaObj.title === 'string' && innerFromMessage) {
        return { title: metaObj.title, payload: innerFromMessage };
    }
    return { title: typeof metaObj.title === 'string' ? metaObj.title : undefined, payload: metaObj };
};

const ERROR_CATEGORIES = new Set([
    'script-error',
    'unhandled-rejection',
    'react-render',
    'network',
    'auth',
    'http-4xx',
    'http-5xx',
    'unknown',
]);

const parseTitle = (title?: string): { app?: string; type: ReportType; label?: string; category?: string } => {
    if (!title) return { type: 'unknown' };
    const bracket = title.match(/^\[([^\]]+)\]\s*(.*)$/);
    const app = bracket?.[1]?.trim();
    const rest = (bracket?.[2] ?? title).trim();
    const issue = rest.match(/^issue:\s*(.*)$/i);
    if (issue) return { app, type: 'issue', label: issue[1].trim() };
    if (ERROR_CATEGORIES.has(rest)) return { app, type: 'error', category: rest };
    if (/^error\b/i.test(rest)) return { app, type: 'error' };
    return { app, type: 'unknown', label: rest || undefined };
};

const inferTypeFromPayload = (payload?: Record<string, unknown>): ReportType => {
    if (!payload) return 'unknown';
    if ('stack' in payload || 'componentStack' in payload || 'http' in payload || 'network' in payload) {
        return 'error';
    }
    if ('logs' in payload || 'version' in payload || 'viewport' in payload) return 'issue';
    return 'unknown';
};

const firstLine = (value?: string): string | undefined => value?.split('\n')[0]?.trim() || undefined;

const asImageList = (value: unknown): string[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    const images = value.filter(
        (v): v is string => typeof v === 'string' && (v.startsWith('data:image/') || /^https?:\/\//.test(v))
    );
    return images.length ? images : undefined;
};

const pickImages = (
    mock: RawMockView,
    metaObj?: Record<string, unknown>,
    payload?: Record<string, unknown>
): string[] | undefined =>
    asImageList(payload?.images) ??
    asImageList(asObject(metaObj?.meta)?.images) ??
    asImageList(metaObj?.images) ??
    asImageList((mock as Record<string, unknown>).images);

const isLogEntryShape = (metaObj: Record<string, unknown>): boolean =>
    typeof metaObj.level === 'string' && typeof metaObj.tag === 'string';

const readAxis = (metaObj: Record<string, unknown>, mock: RawMockView, key: string): string | undefined => {
    const fromMeta = metaObj[key];
    if (typeof fromMeta === 'string' && fromMeta) return fromMeta;
    const fromMock = (mock as Record<string, unknown>)[key];
    return typeof fromMock === 'string' && fromMock ? fromMock : undefined;
};

export const formatOs = (os?: string, osVersion?: string): string | undefined => {
    if (os && osVersion) return `${os} ${osVersion}`;
    return os ?? osVersion;
};

const parseLogData = (value: unknown): unknown => {
    if (typeof value !== 'string') return undefined;
    try {
        return JSON.parse(value);
    } catch {
        return undefined;
    }
};

const RECORD_KINDS = ['log', 'trace', 'sample', 'event'] as const;

const asNumber = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const asString = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined);

const asStringMap = (value: unknown): Record<string, string> | undefined => {
    if (!isObject(value)) return undefined;
    const out = Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === 'string')) as Record<
        string,
        string
    >;
    return Object.keys(out).length ? out : undefined;
};

const asNumberMap = (value: unknown): Record<string, number> | undefined => {
    if (!isObject(value)) return undefined;
    const out = Object.fromEntries(Object.entries(value).filter(([, v]) => asNumber(v) !== undefined)) as Record<
        string,
        number
    >;
    return Object.keys(out).length ? out : undefined;
};

export const areaOfTag = (tag?: string): string | undefined => {
    if (!tag) return undefined;
    const dot = tag.indexOf('.');
    return dot > 0 ? tag.slice(0, dot) : tag.toLowerCase();
};

const dropUndefined = <T extends object>(value: T): Partial<T> =>
    Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;

const readTelemetryFields = (metaObj: Record<string, unknown>, tag?: string): Partial<ReportLogRow> =>
    dropUndefined({
        recordKind: (RECORD_KINDS as readonly unknown[]).includes(metaObj.kind)
            ? (metaObj.kind as ReportLogRow['recordKind'])
            : undefined,
        area: asString(metaObj.area) ?? areaOfTag(tag),
        durationMs: asNumber(metaObj.durationMs),
        attrs: asStringMap(metaObj.attrs),
        metrics: asNumberMap(metaObj.metrics),
        sr: asNumber(metaObj.sr),
        pv: asNumber(metaObj.pv),
        seq: asNumber(metaObj.seq),
        routeTemplate: asString(metaObj.routeTemplate),
        sessionId: asString(metaObj.sessionId),
        platform: asString(metaObj.platform),
        host: asString(metaObj.host),
        httpStatus: asNumber(metaObj.httpStatus),
        errorCode: asString(metaObj.errorCode),
    });

const parseLogEntryRow = (mock: RawMockView, metaObj: Record<string, unknown>): ReportLogRow => {
    const level = typeof metaObj.level === 'string' ? metaObj.level : undefined;
    const tag = typeof metaObj.tag === 'string' ? metaObj.tag : undefined;
    const dataRaw = typeof metaObj.data === 'string' ? metaObj.data : undefined;

    return {
        id: mock.id ?? '',
        type: 'log-entry',
        title: tag ?? '(no tag)',
        message: typeof metaObj.message === 'string' ? metaObj.message : undefined,
        userId: readAxis(metaObj, mock, 'uid'),
        createdAt: typeof mock.createdAt === 'number' ? mock.createdAt : undefined,
        payload: null,
        raw: mock.meta ?? mock,
        parseError: false,
        level,
        tag,
        logData: parseLogData(dataRaw),
        logDataRaw: dataRaw,
        source: typeof metaObj.source === 'string' ? metaObj.source : undefined,
        runId: readAxis(metaObj, mock, 'runId'),
        timestamp: typeof metaObj.timestamp === 'number' ? metaObj.timestamp : undefined,
        cid: readAxis(metaObj, mock, 'cid'),
        sid: readAxis(metaObj, mock, 'sid'),
        appVersion: typeof metaObj.appVersion === 'string' ? metaObj.appVersion : undefined,
        webVersion: typeof metaObj.webVersion === 'string' ? metaObj.webVersion : undefined,
        route: typeof metaObj.route === 'string' ? metaObj.route : undefined,
        os: readAxis(metaObj, mock, 'os'),
        osVersion: readAxis(metaObj, mock, 'osVersion'),
        model: readAxis(metaObj, mock, 'model'),
        ...readTelemetryFields(metaObj, tag),
    };
};

export const parseReportLog = (mock: RawMockView): ReportLogRow => {
    const metaObj = asObject(mock.meta);
    if (metaObj && isLogEntryShape(metaObj)) return parseLogEntryRow(mock, metaObj);

    const id = mock.id ?? '';
    const createdAt = typeof mock.createdAt === 'number' ? mock.createdAt : undefined;

    const { title: unwrappedTitle, payload } =
        metaObj !== undefined ? unwrapReport(metaObj) : { title: undefined, payload: undefined };

    const titleSource = unwrappedTitle ?? (typeof mock.name === 'string' ? mock.name : undefined) ?? payload?.title;
    const parsed = parseTitle(typeof titleSource === 'string' ? titleSource : undefined);

    const type = parsed.type !== 'unknown' ? parsed.type : inferTypeFromPayload(payload);
    const app = parsed.app ?? (typeof payload?.app === 'string' ? payload.app : undefined);
    const env = typeof payload?.env === 'string' ? payload.env : undefined;
    const category = parsed.category ?? (typeof payload?.category === 'string' ? payload.category : undefined);

    const label =
        parsed.label ??
        (typeof payload?.title === 'string' ? payload.title : undefined) ??
        firstLine(typeof payload?.message === 'string' ? payload.message : undefined) ??
        (typeof titleSource === 'string' ? titleSource : undefined) ??
        '(untitled)';

    const user = (payload?.user ?? undefined) as Record<string, unknown> | undefined;
    const uid =
        (typeof user?.uid === 'string' ? user.uid : undefined) ?? (typeof mock.uid === 'string' ? mock.uid : undefined);
    const versionInfo = asObject(payload?.version);
    const trail = Array.isArray(payload?.routeTrail) ? payload.routeTrail : undefined;
    const previousRoute = trail && trail.length >= 2 ? trail[trail.length - 2] : undefined;

    return {
        id,
        type,
        category,
        app,
        env,
        title: label,
        message: typeof payload?.message === 'string' ? payload.message : undefined,
        userName: typeof user?.name === 'string' ? user.name : undefined,
        userId: uid,
        cid: typeof mock.cid === 'string' ? mock.cid : undefined,
        sid: typeof mock.sid === 'string' ? mock.sid : undefined,
        appVersion: typeof versionInfo?.appVersion === 'string' ? versionInfo.appVersion : undefined,
        webVersion: typeof versionInfo?.webVersion === 'string' ? versionInfo.webVersion : undefined,
        route:
            (typeof previousRoute === 'string' ? previousRoute : undefined) ??
            (typeof payload?.path === 'string' ? payload.path : undefined),
        createdAt,
        images: pickImages(mock, metaObj, payload),
        payload: (payload as ReportPayload | undefined) ?? null,
        raw: mock.meta ?? mock,
        parseError: metaObj === undefined && mock.meta !== undefined && mock.meta !== null,
    };
};
