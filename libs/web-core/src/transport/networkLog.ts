import { logger } from '@chatic/bridges';
import { redactSensitive, truncate } from '@chatic/logger';

import type { ApiRequestMethod } from './request';

/** Tag used for every transport-level network log entry. */
export const NETWORK_LOG_TAG = 'NET';

/** Request metadata known before the call is executed. */
export interface NetworkRequestMeta {
    method: ApiRequestMethod;
    url: string;
    params?: unknown;
    body?: unknown;
}

/** Structured payload attached to every network log entry as `data`. */
export interface NetworkLogFields {
    outcome: 'success' | 'error';
    method: ApiRequestMethod;
    url: string;
    durationMs: number;
    params?: unknown;
    requestBody?: unknown;
    status?: number;
    errorCode?: string;
    responseData?: unknown;
}

const baseFields = (req: NetworkRequestMeta): Pick<NetworkLogFields, 'method' | 'url' | 'params' | 'requestBody'> => ({
    method: req.method,
    url: req.url,
    params: truncate(redactSensitive(req.params)),
    requestBody: truncate(redactSensitive(req.body)),
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
 * Wraps a transport execute call to emit a structured network log for both
 * success and failure. The structured fields are plain, JSON-serializable
 * objects, so they survive `safeSerializable` intact on the way to the native
 * bridge — unlike a raw axios error, whose `response`/`config`/`code` would be
 * dropped.
 *
 * - success: `debug` (or `warn` when the 200 body carries an `error` field,
 *   which `throwIfApiError` will reject downstream)
 * - failure: `error`, carrying status/code and the response body; the original
 *   error is re-thrown so caller behavior is unchanged.
 */
export const withNetworkLog = async <T extends { data?: unknown }>(
    req: NetworkRequestMeta,
    run: () => Promise<T>
): Promise<T> => {
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
            responseData: truncate(redactSensitive(res?.data)),
        };

        if (responseError !== undefined) {
            logger.warn(NETWORK_LOG_TAG, `${req.method} ${req.url} responded with error field`, fields);
        } else {
            logger.debug(NETWORK_LOG_TAG, `${req.method} ${req.url}`, fields);
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
            responseData: truncate(redactSensitive(readResponseData(error))),
        };

        logger.error(NETWORK_LOG_TAG, `${req.method} ${req.url} failed`, { error, data: fields });

        throw error;
    }
};
