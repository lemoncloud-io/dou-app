import { staleCredentialMarker } from './credentialStale';

import type { HttpRoute } from '../ports';

export const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

export enum ErrorType {
    AUTHENTICATION = 'authentication', // 403 - logout required
    NETWORK = 'network', // Network connectivity issue - retry
    SERVER = 'server', // 5xx - retry
    CLIENT = 'client', // 4xx (except 403) - fail immediately
    UNKNOWN = 'unknown', // Other
}

export interface ErrorClassification {
    type: ErrorType;
    shouldRetry: boolean;
    shouldLogout: boolean;
    message: string;
    /**
     * The failure is recoverable by re-minting THIS route's signing credential — refresh (relay) or
     * re-issue (cloud), which is the caller's decision, not this classifier's. Absent on every other
     * classification, including the logout-worthy ones: a credential that merely lapsed says nothing
     * about whether the session behind it is still good.
     */
    refreshRoute?: HttpRoute;
}

const DEFAULT_ERROR_MESSAGE = '알 수 없는 오류가 발생했습니다';

export const classifyError = (error: any): ErrorClassification => {
    const status = error?.status || error?.response?.status || error?.statusCode;
    const message = error?.message || '';

    // Checked FIRST, and deliberately ahead of every status/message rule: the transport already
    // knows this route's credential was lapsed when the call went out, which is a stronger signal
    // than anything reconstructable from the error text. It is also the only signal available for
    // the failure this exists to catch — an API Gateway IAM rejection whose 403 carries no CORS
    // header, so the browser hands the app a status-less `ERR_NETWORK` and every rule below would
    // read it as a network outage. See `error/credentialStale.ts`.
    const staleRoute = staleCredentialMarker.routeOf(error);
    if (staleRoute) {
        return {
            type: ErrorType.AUTHENTICATION,
            // Retrying the same request with the same dead credential fails identically. The
            // recovery is to re-mint first — `refreshRoute` says which credential, and the caller
            // owns the retry.
            shouldRetry: false,
            // NOT a logout: a lapsed credential is the ordinary end of an AWS temporary credential's
            // life, and the session behind it is usually fine. Tearing the session down here would
            // log a user out for the crime of leaving a tab open for an hour.
            shouldLogout: false,
            refreshRoute: staleRoute,
            message: '세션 자격증명이 만료되었습니다',
        };
    }

    if (message.includes('INVALID_TOKEN') || message.includes('Token validation failed')) {
        return {
            type: ErrorType.AUTHENTICATION,
            shouldRetry: false,
            shouldLogout: true,
            message: '토큰이 유효하지 않습니다',
        };
    }

    // Server-side signature verification timeout — signature is invalid because the AWS
    // credentials expired. An Error created by throwIfApiError has no HTTP status, so this is
    // judged from the message alone. A client-side timeout (the "TIMEOUT:" prefix) is handled
    // separately in isNetworkError.
    if (message.includes('signature timeout') || (status === 400 && message.includes('TIMEOUT'))) {
        return {
            type: ErrorType.AUTHENTICATION,
            shouldRetry: false,
            shouldLogout: true,
            message: '인증 서명이 만료되었습니다',
        };
    }

    if (status === 403) {
        return {
            type: ErrorType.AUTHENTICATION,
            shouldRetry: false,
            shouldLogout: true,
            message: '인증이 만료되었습니다',
        };
    }

    // Signature verification failure (lemon hmac mismatch, a rotated auth model, etc). An Error
    // made by throwIfApiError has no HTTP status, so this used to flow to UNKNOWN → retry — but
    // re-signing with the same material and retrying is guaranteed to fail the same way (a retry
    // runaway booster — 2026-08 session audit §5-6). This does not log out immediately: if the
    // socket refresh writeback renews the material, the state is recoverable, so only the retry
    // is cut off here. A 403 that carries a status keeps the existing policy (logout) above.
    if (/no auth model/i.test(message) || (/signature/i.test(message) && /invalid|mismatch|not valid/i.test(message))) {
        return {
            type: ErrorType.AUTHENTICATION,
            shouldRetry: false,
            shouldLogout: false,
            message: '인증 서명이 유효하지 않습니다',
        };
    }

    if (isNetworkError(error)) {
        return {
            type: ErrorType.NETWORK,
            shouldRetry: true,
            shouldLogout: false,
            message: '네트워크 연결을 확인해주세요',
        };
    }

    if (status >= 500 && status < 600) {
        return {
            type: ErrorType.SERVER,
            shouldRetry: true,
            shouldLogout: false,
            message: '서버 오류가 발생했습니다',
        };
    }

    if (status >= 400 && status < 500) {
        return {
            type: ErrorType.CLIENT,
            shouldRetry: false,
            shouldLogout: false,
            message: '요청에 문제가 있습니다',
        };
    }

    return {
        type: ErrorType.UNKNOWN,
        shouldRetry: true,
        shouldLogout: false,
        message: '알 수 없는 오류가 발생했습니다',
    };
};

const isNetworkError = (error: any): boolean => {
    // If there's an HTTP response, the server responded, so it's not a network error
    const status = error?.status || error?.response?.status || error?.statusCode;
    if (status && status >= 400) {
        return false;
    }

    // Axios network error
    if (error?.code === 'ERR_NETWORK' || error?.code === 'ERR_INTERNET_DISCONNECTED') {
        return true;
    }
    // Network connection failure
    if (error?.message?.includes('Network Error') || error?.message?.includes('fetch failed')) {
        return true;
    }
    // Client-side timeout (ECONNABORTED, or our withTimeout's TIMEOUT: prefix)
    if (error?.code === 'ECONNABORTED' || error?.message?.startsWith('TIMEOUT:')) {
        return true;
    }
    // Connection refused
    if (error?.code === 'ECONNREFUSED') {
        return true;
    }

    return false;
};

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
