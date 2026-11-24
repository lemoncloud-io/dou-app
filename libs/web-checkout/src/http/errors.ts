import { SubscriptionPortError, type SubscriptionPortErrorCode } from '../port/errors';

export const isDeclinedPayment = (error: unknown): boolean => {
    const { status, message } = failureOf(error);
    return status === 403 && message.includes('INVALID PAYMENT');
};

const isRefusedAccount = (message: string): boolean => /main user only/i.test(message);

export interface HttpFailure {
    status?: number;
    message: string;
}

export const failureOf = (error: unknown): HttpFailure => {
    const response = (error as { response?: { status?: number; data?: unknown } } | null)?.response;
    const data = response?.data;
    const message =
        typeof data === 'string'
            ? data
            : typeof (data as { message?: unknown } | undefined)?.message === 'string'
              ? (data as { message: string }).message
              : error instanceof Error
                ? error.message
                : String(error);
    return { status: response?.status, message };
};

export const portErrorOf = (error: unknown): SubscriptionPortError => {
    if (error instanceof SubscriptionPortError) return error;
    const { status, message } = failureOf(error);
    const code: SubscriptionPortErrorCode =
        status === 403 && isRefusedAccount(message)
            ? 'notAllowed'
            : status === 401 || status === 403
              ? 'unauthenticated'
              : status === 404
                ? 'notFound'
                : status === 400 || status === 409
                  ? 'conflict'
                  : 'network';
    return new SubscriptionPortError(code, message);
};
