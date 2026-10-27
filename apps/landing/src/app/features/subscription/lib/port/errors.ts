/**
 * The one error a port method rejects with. A screen picks its copy from `code` and never reads the
 * message, which is for the console only.
 *
 * - `unauthenticated` — the session is gone. No screen handles this: the route root sends the visitor
 *   to sign in again and back to where they were.
 * - `notFound` — the id names nothing this account owns.
 * - `conflict` — the subscription's state does not allow the action (cancelling twice, deleting the
 *   default card, …).
 * - `limit` — a count ran out: billing emails, or card registration attempts.
 * - `invalidCode` — an email verification code that does not match.
 * - `network` — the request did not complete.
 * - `signInCanceled` / `signInExpired` — the sign-in round trip came back canceled, or too late
 *   (including a callback whose nonce does not match the attempt that started it). `detail.next` carries
 *   the return path the attempt started with, so trying again keeps it.
 * - `codeExpired` — the email verification code timed out; ask for a new one.
 * - `tooManyAttempts` — the code was entered wrong too often and no longer works; ask for a new one.
 * - `resendLimit` — no more codes for now; `detail.retryAt` is when asking works again.
 * - `disposableEmail` — a throwaway address, refused for billing mail.
 */
export type SubscriptionPortErrorCode =
    | 'unauthenticated'
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
    | 'disposableEmail';

/** What some errors say beyond their code. */
export interface SubscriptionPortErrorDetail {
    /** `invalidCode` — wrong entries the code still allows. */
    attemptsLeft?: number;
    /** `resendLimit`, or a `conflict` for asking too soon — when a new code may be asked for (ISO date-time). */
    retryAt?: string;
    /** `signInCanceled` / `signInExpired` — the return path the sign-in started with. */
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
