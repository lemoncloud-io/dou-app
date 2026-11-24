export type SubscriptionPortErrorCode =
    | 'unauthenticated'
    | 'notAllowed'
    | 'notFound'
    | 'conflict'
    | 'limit'
    | 'invalidCode'
    | 'network'
    | 'signInCanceled'
    | 'signInExpired'
    | 'codeExpired'
    | 'tooManyAttempts'
    | 'resendLimit'
    | 'disposableEmail'
    | 'invalid';

export interface SubscriptionPortErrorDetail {
    attemptsLeft?: number;
    retryAt?: string;
    next?: string;
}

export class SubscriptionPortError extends Error {
    readonly code: SubscriptionPortErrorCode;
    readonly detail?: SubscriptionPortErrorDetail;

    constructor(code: SubscriptionPortErrorCode, message: string = code, detail?: SubscriptionPortErrorDetail) {
        super(message);
        this.name = 'SubscriptionPortError';
        this.code = code;
        this.detail = detail;
    }
}

export const isPortError = (error: unknown, code?: SubscriptionPortErrorCode): error is SubscriptionPortError =>
    error instanceof SubscriptionPortError && (code === undefined || error.code === code);
