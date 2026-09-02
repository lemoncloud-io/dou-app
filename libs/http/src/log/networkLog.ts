/** Tag used for every transport-level network log entry. */
export const NETWORK_LOG_TAG = 'NET';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | (string & {});

/** Request metadata known before the call is executed. */
export interface NetworkRequestMeta {
    method: HttpMethod;
    url: string;
    params?: unknown;
    body?: unknown;
    /**
     * Mirrors `ApiRequestOptions.allowRecordError`: the caller reads the body as a record whose
     * `error` field is data, so an `error` in a 200 is not an escalation here either.
     */
    allowRecordError?: boolean;
}

/**
 * Structured payload handed to the log sink. Fields are RAW here — `@chatic/http` has zero
 * `@chatic/*` runtime dependencies, and redact/truncate live in `@chatic/logger`, so applying them
 * is the sink's job, not this lib's. See ADR-0070 결정 3 / libs/http architecture doc §상세 구현.
 */
export interface NetworkLogFields {
    outcome: 'success' | 'error';
    method: HttpMethod;
    url: string;
    durationMs: number;
    params?: unknown;
    requestBody?: unknown;
    status?: number;
    errorCode?: string;
    responseData?: unknown;
}

/** Sink the caller injects to receive structured network log entries. Absent = no logging. */
export interface HttpLogSink {
    debug(tag: string, message: string, fields: NetworkLogFields): void;
    warn(tag: string, message: string, fields: NetworkLogFields): void;
    error(tag: string, message: string, fields: NetworkLogFields & { error: unknown }): void;
}

const baseFields = (req: NetworkRequestMeta): Pick<NetworkLogFields, 'method' | 'url' | 'params' | 'requestBody'> => ({
    method: req.method,
    url: req.url,
    params: req.params,
    requestBody: req.body,
});

/** Extracts an HTTP status from an axios response shape, when present. */
const readStatus = (res: unknown): number | undefined => {
    const status = (res as { status?: unknown })?.status;
    return typeof status === 'number' ? status : undefined;
};

/** Extracts a status/error code from an axios (or wrapped) error, defensively. */
const readErrorCode = (error: unknown): string | undefined => {
    const err = error as { status?: unknown; response?: { status?: unknown }; statusCode?: unknown; code?: unknown };
    const status = err?.status ?? err?.response?.status ?? err?.statusCode;
    if (typeof status === 'number' || typeof status === 'string') return String(status);
    if (typeof err?.code === 'string') return err.code;
    return undefined;
};

const readResponseData = (error: unknown): unknown => {
    const err = error as { response?: { data?: unknown } };
    return err?.response?.data;
};

/**
 * Wraps a transport execute call to emit a structured network log for both success and failure
 * through the injected sink. No sink → no logging (the caller's `bypass` list, or simply omitting
 * `logSink` in `HttpRuntimePorts`, both land here as `sink === undefined`).
 *
 * - success: `debug` (or `warn` when the 200 body carries an `error` field, which
 *   `throwIfApiError` rejects downstream — unless the caller passed `allowRecordError`, which keeps
 *   that field as data)
 * - failure: `error`, carrying status/code and the response body; the original error is re-thrown
 *   so caller behavior is unchanged.
 */
export const withNetworkLog = async <T extends { data?: unknown }>(
    req: NetworkRequestMeta,
    run: () => Promise<T>,
    sink: HttpLogSink | undefined
): Promise<T> => {
    if (!sink) return run();

    const startedAt = Date.now();

    try {
        const res = await run();
        const durationMs = Date.now() - startedAt;
        const responseError = (res?.data as { error?: unknown } | undefined)?.error;

        // No response body on success: it is bulk with little diagnostic value, and every one of
        // these entries is now a candidate for upload rather than just a local breadcrumb. Failures
        // still carry theirs — that is where the body explains something.
        const fields: NetworkLogFields = {
            outcome: 'success',
            ...baseFields(req),
            durationMs,
            status: readStatus(res),
        };

        if (responseError !== undefined && !req.allowRecordError) {
            sink.warn(NETWORK_LOG_TAG, `${req.method} ${req.url} responded with error field`, fields);
        } else {
            sink.debug(NETWORK_LOG_TAG, `${req.method} ${req.url}`, fields);
        }

        return res;
    } catch (error) {
        const durationMs = Date.now() - startedAt;

        const fields: NetworkLogFields = {
            outcome: 'error',
            ...baseFields(req),
            durationMs,
            status: readStatus((error as { response?: unknown })?.response),
            errorCode: readErrorCode(error),
            responseData: readResponseData(error),
        };

        // Status/code ride in the message, not just in `fields`: a breadcrumb line (report tail,
        // console) is read without expanding objects, and "failed" alone forces a drill-down to
        // learn whether the server rejected it or the request never left. @see ADR-0047
        // `readErrorCode` already prefers the status, so the two collapse to the same string on an
        // HTTP failure — take the status when a response came back, and the transport code
        // (ERR_NETWORK, …) when none did.
        const cause = fields.status ? String(fields.status) : fields.errorCode;
        sink.error(NETWORK_LOG_TAG, `${req.method} ${req.url} failed${cause ? ` (${cause})` : ''}`, {
            ...fields,
            error,
        });

        throw error;
    }
};
