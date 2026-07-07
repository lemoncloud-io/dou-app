// Local error helpers. These were previously imported from `@chatic/web-core`,
// but that package no longer re-exports them from its public barrel. They are
// trivial, dependency-free utilities, so we keep an app-local copy (mirrors
// apps/web/src/app/utils/errors.ts + the extractErrorMessage impl from
// libs/web-core/src/transport/error.ts).

/** Coerce an unknown thrown value into a real Error instance. */
export const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

const DEFAULT_ERROR_MESSAGE = '알 수 없는 오류가 발생했습니다';

// `any` is deliberate: error shapes are heterogeneous (Error | axios | string | api payload).
export const extractErrorMessage = (error: any): string => {
    if (!error) {
        return DEFAULT_ERROR_MESSAGE;
    }

    if (error.message) {
        return error.message;
    }

    if (error.status || error.statusText) {
        return `${error.status || ''} ${error.statusText || ''}`.trim();
    }

    if (typeof error === 'string') {
        return error;
    }

    if (error.toString && error.toString() !== '[object Object]') {
        return error.toString();
    }

    if (error.response?.data) {
        if (error.response.data.error) {
            return error.response.data.error;
        }
        if (error.response.data.message) {
            return error.response.data.message;
        }
    }

    return DEFAULT_ERROR_MESSAGE;
};
