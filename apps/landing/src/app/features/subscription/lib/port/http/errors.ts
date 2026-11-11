import { SubscriptionPortError, type SubscriptionPortErrorCode } from '../errors';

/**
 * A charge the card company declined. The server says so in its message (`403 INVALID PAYMENT - …`);
 * any other 403 on the same call — a session it refuses, credentials the gateway rejects — is not a
 * card problem, and reading it as one would send the reader back to the card window for nothing.
 */
export const isDeclinedPayment = (error: unknown): boolean => {
    const { status, message } = failureOf(error);
    return status === 403 && message.includes('INVALID PAYMENT');
};

/** What a failed request says about itself: the HTTP status, if a response came back at all. */
export interface HttpFailure {
    status?: number;
    message: string;
}

/** Reads an axios-shaped rejection (`response.status`, the server's message as `response.data`). */
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

/**
 * The port's error for a failed request. The server's own words go to the console only.
 *
 * A 403 is the session the server does not accept — a guest, or credentials it refuses — except on
 * the two calls that charge, where it is a declined payment; those read the status themselves
 * before they come here. A 400 is the server refusing what the state allows, the same as a 409 to a
 * screen. No response at all, or the server failing, is the request not completing.
 */
export const portErrorOf = (error: unknown): SubscriptionPortError => {
    if (error instanceof SubscriptionPortError) return error;
    const { status, message } = failureOf(error);
    const code: SubscriptionPortErrorCode =
        status === 401 || status === 403
            ? 'unauthenticated'
            : status === 404
              ? 'notFound'
              : status === 400 || status === 409
                ? 'conflict'
                : 'network';
    return new SubscriptionPortError(code, message);
};
