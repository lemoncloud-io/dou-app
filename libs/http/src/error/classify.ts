import { staleCredentialMarker } from './credentialStale';

import type { HttpRoute } from '../ports';

export const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

export enum ErrorType {
    AUTHENTICATION = 'authentication',
    NETWORK = 'network',
    SERVER = 'server',
    CLIENT = 'client',
    UNKNOWN = 'unknown',
}

export interface ErrorClassification {
    type: ErrorType;
    shouldRetry: boolean;
    shouldLogout: boolean;
    message: string;
    refreshRoute?: HttpRoute;
}

const DEFAULT_ERROR_MESSAGE = 'An unknown error occurred';

export const classifyError = (error: any): ErrorClassification => {
    const status = error?.status || error?.response?.status || error?.statusCode;
    const message = error?.message || '';

    const staleRoute = staleCredentialMarker.routeOf(error);
    if (staleRoute) {
        return {
            type: ErrorType.AUTHENTICATION,
            shouldRetry: false,
            shouldLogout: false,
            refreshRoute: staleRoute,
            message: 'Session credentials have expired',
        };
    }

    if (message.includes('INVALID_TOKEN') || message.includes('Token validation failed')) {
        return {
            type: ErrorType.AUTHENTICATION,
            shouldRetry: false,
            shouldLogout: true,
            message: 'Token is invalid',
        };
    }

    if (message.includes('signature timeout') || (status === 400 && message.includes('TIMEOUT'))) {
        return {
            type: ErrorType.AUTHENTICATION,
            shouldRetry: false,
            shouldLogout: true,
            message: 'Authentication signature has expired',
        };
    }

    if (status === 403) {
        return {
            type: ErrorType.AUTHENTICATION,
            shouldRetry: false,
            shouldLogout: true,
            message: 'Authentication has expired',
        };
    }

    if (/no auth model/i.test(message) || (/signature/i.test(message) && /invalid|mismatch|not valid/i.test(message))) {
        return {
            type: ErrorType.AUTHENTICATION,
            shouldRetry: false,
            shouldLogout: false,
            message: 'Authentication signature is invalid',
        };
    }

    if (isNetworkError(error)) {
        return {
            type: ErrorType.NETWORK,
            shouldRetry: true,
            shouldLogout: false,
            message: 'Please check your network connection',
        };
    }

    if (status >= 500 && status < 600) {
        return {
            type: ErrorType.SERVER,
            shouldRetry: true,
            shouldLogout: false,
            message: 'A server error occurred',
        };
    }

    if (status >= 400 && status < 500) {
        return {
            type: ErrorType.CLIENT,
            shouldRetry: false,
            shouldLogout: false,
            message: 'There is a problem with the request',
        };
    }

    return {
        type: ErrorType.UNKNOWN,
        shouldRetry: true,
        shouldLogout: false,
        message: 'An unknown error occurred',
    };
};

const isNetworkError = (error: any): boolean => {
    const status = error?.status || error?.response?.status || error?.statusCode;
    if (status && status >= 400) {
        return false;
    }

    if (error?.code === 'ERR_NETWORK' || error?.code === 'ERR_INTERNET_DISCONNECTED') {
        return true;
    }
    if (error?.message?.includes('Network Error') || error?.message?.includes('fetch failed')) {
        return true;
    }
    if (error?.code === 'ECONNABORTED' || error?.message?.startsWith('TIMEOUT:')) {
        return true;
    }
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
