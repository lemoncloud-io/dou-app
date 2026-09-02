import { staleCredentialMarker } from './credentialStale';

import type { HttpRoute } from '../ports';

export const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

export enum ErrorType {
    AUTHENTICATION = 'authentication', // 403 - 로그아웃 필요
    NETWORK = 'network', // 네트워크 연결 문제 - 재시도
    SERVER = 'server', // 5xx - 재시도
    CLIENT = 'client', // 4xx (403 제외) - 즉시 실패
    UNKNOWN = 'unknown', // 기타
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

    // 서버 측 서명 검증 타임아웃 — AWS credentials 만료로 signature가 유효하지 않음
    // throwIfApiError로 생성된 Error는 HTTP status가 없으므로 메시지만으로도 판별
    // 클라이언트 타임아웃("TIMEOUT:" 접두어)은 isNetworkError에서 별도 처리
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

    // 서명 검증 실패(lemon hmac 불일치, 회전된 auth 모델 등). throwIfApiError가 만든 Error는 HTTP
    // status가 없어 예전엔 UNKNOWN→재시도로 흘렀는데, 같은 재료로 다시 서명하므로 재시도는 반드시
    // 같은 실패다(리트라이 폭주 부스터 — 2026-08 session audit §5-6). 즉시 로그아웃은 하지 않는다:
    // 소켓 리프레시 writeback이 재료를 갱신하면 회복 가능한 상태라, 여기서는 재시도만 끊는다.
    // status 있는 403은 위에서 기존 정책(로그아웃)을 유지한다.
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
    // HTTP 응답이 있으면 서버가 응답한 것이므로 네트워크 에러가 아님
    const status = error?.status || error?.response?.status || error?.statusCode;
    if (status && status >= 400) {
        return false;
    }

    // Axios 네트워크 에러
    if (error?.code === 'ERR_NETWORK' || error?.code === 'ERR_INTERNET_DISCONNECTED') {
        return true;
    }
    // 네트워크 연결 실패
    if (error?.message?.includes('Network Error') || error?.message?.includes('fetch failed')) {
        return true;
    }
    // 클라이언트 측 타임아웃 (ECONNABORTED, 또는 우리 withTimeout의 TIMEOUT: 접두어)
    if (error?.code === 'ECONNABORTED' || error?.message?.startsWith('TIMEOUT:')) {
        return true;
    }
    // 연결 거부
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
