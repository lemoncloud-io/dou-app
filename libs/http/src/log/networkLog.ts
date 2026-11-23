export const NETWORK_LOG_TAG = 'NET';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | (string & {});

export interface NetworkRequestMeta {
    method: HttpMethod;
    url: string;
    params?: unknown;
    body?: unknown;
    allowRecordError?: boolean;
}

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
    responseBytes?: number;
}

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

const readResponseBytes = (res: unknown): number | undefined => {
    const headers = (res as { headers?: Record<string, unknown> })?.headers;
    const raw = headers?.['content-length'] ?? headers?.['Content-Length'];
    const bytes = typeof raw === 'string' ? Number(raw) : raw;
    return typeof bytes === 'number' && Number.isFinite(bytes) && bytes >= 0 ? bytes : undefined;
};

const readStatus = (res: unknown): number | undefined => {
    const status = (res as { status?: unknown })?.status;
    return typeof status === 'number' ? status : undefined;
};

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

        const fields: NetworkLogFields = {
            outcome: 'success',
            ...baseFields(req),
            durationMs,
            status: readStatus(res),
        };
        const responseBytes = readResponseBytes(res);
        if (responseBytes !== undefined) fields.responseBytes = responseBytes;

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

        const cause = fields.status ? String(fields.status) : fields.errorCode;
        sink.error(NETWORK_LOG_TAG, `${req.method} ${req.url} failed${cause ? ` (${cause})` : ''}`, {
            ...fields,
            error,
        });

        throw error;
    }
};
