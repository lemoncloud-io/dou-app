/**
 * `lib/report-logs/parseReportLog.ts`
 * - Turns a raw `MockView` report record into a `ReportLogRow` for the list/drawer.
 *
 * The exact storage shape of `/mocks/0/list` is unverified (see spec risk):
 * the report payload may live in `meta` as an object, in `meta` as a JSON
 * string, wrapped one level inside a `SlackReportBody { title, message }`, or
 * at the record's top level. This parser probes those shapes defensively and
 * always preserves the raw record so the drawer can fall back to raw JSON.
 */
import type { RawMockView } from '../api/reportLogApi';

export type ReportType = 'error' | 'issue' | 'unknown';

/** Loose view of the report payload (ErrorReportPayload | issue payload). */
export interface ReportPayload {
    title?: string;
    message?: string;
    stack?: string;
    componentStack?: string;
    app?: string;
    env?: string;
    url?: string;
    timestamp?: string;
    userAgent?: string;
    user?: Record<string, unknown>;
    cloud?: Record<string, unknown>;
    http?: Record<string, unknown>;
    device?: Record<string, unknown>;
    network?: Record<string, unknown>;
    version?: Record<string, unknown>;
    viewport?: Record<string, unknown>;
    path?: string;
    logs?: unknown[];
    [key: string]: unknown;
}

export interface ReportLogRow {
    id: string;
    type: ReportType;
    /** Error category from the title/payload, e.g. `script-error` / `network` (ADR-0029). */
    category?: string;
    /** Platform parsed from the stored title bracket, e.g. `web` / `mobile`. */
    app?: string;
    env?: string;
    /** Human-facing summary line (issue title, or the error message). */
    title: string;
    /** The report payload `message` (issue body / error message), if present. */
    message?: string;
    /** Reporter identity for at-a-glance context. */
    userName?: string;
    userId?: string;
    createdAt?: number;
    /** User-attached screenshots (base64 data URLs), when the report carried any. */
    images?: string[];
    /** Parsed inner report payload, or null when parsing failed. */
    payload: ReportPayload | null;
    /** Original meta/record kept for the raw-JSON fallback view. */
    raw: unknown;
    /** True when the payload could not be parsed into an object. */
    parseError: boolean;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Parse a value that may already be an object or a JSON string; else undefined. */
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

/**
 * A `SlackReportBody` wrapper has a `title` plus a `message` that is itself a
 * JSON-encoded payload. Detect that so we can unwrap one level and keep the
 * outer title (which carries `[app] error` / `[app] issue: ...`).
 */
const unwrapReport = (metaObj: Record<string, unknown>): { title?: string; payload?: Record<string, unknown> } => {
    const innerFromMessage = typeof metaObj.message === 'string' ? asObject(metaObj.message) : undefined;
    if (typeof metaObj.title === 'string' && innerFromMessage) {
        // SlackReportBody { title, message: JSON(payload) }
        return { title: metaObj.title, payload: innerFromMessage };
    }
    // Otherwise treat the object itself as the payload.
    return { title: typeof metaObj.title === 'string' ? metaObj.title : undefined, payload: metaObj };
};

/**
 * Known error categories carried in the title as `[app] <category>` (ADR-0029).
 * Mirrors `ErrorCategory` in `@chatic/web-core` — kept as a runtime Set here
 * because the union type has no runtime value to iterate.
 */
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

/**
 * Parse the report title into app + type + optional category/label.
 * - `[app] issue: ...`      → issue
 * - `[app] <category>`      → error, with category (new format, ADR-0029)
 * - `[app] error`           → error (legacy format, no category)
 */
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

/** Fall back to payload contents when the title didn't disambiguate the type. */
const inferTypeFromPayload = (payload?: Record<string, unknown>): ReportType => {
    if (!payload) return 'unknown';
    if ('stack' in payload || 'componentStack' in payload || 'http' in payload || 'network' in payload) {
        return 'error';
    }
    if ('logs' in payload || 'version' in payload || 'viewport' in payload) return 'issue';
    return 'unknown';
};

const firstLine = (value?: string): string | undefined => value?.split('\n')[0]?.trim() || undefined;

/** Keep only entries an `<img src>` can actually render, so a stray field cannot inject a URL. */
const asImageList = (value: unknown): string[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    const images = value.filter(
        (v): v is string => typeof v === 'string' && (v.startsWith('data:image/') || /^https?:\/\//.test(v))
    );
    return images.length ? images : undefined;
};

/**
 * Find the user-attached screenshots. The client puts them in the report payload —
 * `SlackReportBody.meta` was tried first but the backend discards a client-supplied
 * `meta` (verified 2026-08-11, ADR-0049), leaving `message` as the only field that
 * survives. The `meta` spots are still probed so reports sent by the short-lived
 * meta build, and any future backend that does keep it, still render.
 */
const pickImages = (
    mock: RawMockView,
    metaObj?: Record<string, unknown>,
    payload?: Record<string, unknown>
): string[] | undefined =>
    // Current transport: inside the payload carried by `message`.
    asImageList(payload?.images) ??
    // SlackReportBody wrapper kept intact → a stored `meta` would be its sibling field.
    asImageList(asObject(metaObj?.meta)?.images) ??
    asImageList(metaObj?.images) ??
    asImageList((mock as Record<string, unknown>).images);

/**
 * Convert a raw report record into a `ReportLogRow`. Never throws — on any
 * failure it returns a row with `parseError: true` and the raw record retained.
 */
export const parseReportLog = (mock: RawMockView): ReportLogRow => {
    const id = mock.id ?? '';
    const createdAt = typeof mock.createdAt === 'number' ? mock.createdAt : undefined;

    // Payload can be inside meta (object/string) or reconstructed from the record.
    const metaObj = asObject(mock.meta);
    const { title: unwrappedTitle, payload } =
        metaObj !== undefined ? unwrapReport(metaObj) : { title: undefined, payload: undefined };

    // Title source: the SlackReportBody title (from meta) first, then record name.
    const titleSource = unwrappedTitle ?? (typeof mock.name === 'string' ? mock.name : undefined) ?? payload?.title;
    const parsed = parseTitle(typeof titleSource === 'string' ? titleSource : undefined);

    const type = parsed.type !== 'unknown' ? parsed.type : inferTypeFromPayload(payload);
    const app = parsed.app ?? (typeof payload?.app === 'string' ? payload.app : undefined);
    const env = typeof payload?.env === 'string' ? payload.env : undefined;
    // Category: title token first (new format), else the payload `category` field.
    const category = parsed.category ?? (typeof payload?.category === 'string' ? payload.category : undefined);

    // Human summary: issue label, else the error/payload message, else the title.
    const label =
        parsed.label ??
        (typeof payload?.title === 'string' ? payload.title : undefined) ??
        firstLine(typeof payload?.message === 'string' ? payload.message : undefined) ??
        (typeof titleSource === 'string' ? titleSource : undefined) ??
        '(untitled)';

    const user = (payload?.user ?? undefined) as Record<string, unknown> | undefined;

    return {
        id,
        type,
        category,
        app,
        env,
        title: label,
        message: typeof payload?.message === 'string' ? payload.message : undefined,
        userName: typeof user?.name === 'string' ? user.name : undefined,
        userId: typeof user?.uid === 'string' ? user.uid : undefined,
        createdAt,
        images: pickImages(mock, metaObj, payload),
        payload: (payload as ReportPayload | undefined) ?? null,
        raw: mock.meta ?? mock,
        parseError: metaObj === undefined && mock.meta !== undefined,
    };
};
