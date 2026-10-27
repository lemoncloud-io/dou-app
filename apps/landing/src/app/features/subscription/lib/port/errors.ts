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
 *   (including a callback whose nonce does not match the attempt that started it).
 */
export type SubscriptionPortErrorCode =
    | 'unauthenticated'
    | 'notFound'
    | 'conflict'
    | 'limit'
    | 'invalidCode'
    | 'network'
    | 'signInCanceled'
    | 'signInExpired';

export class SubscriptionPortError extends Error {
    readonly code: SubscriptionPortErrorCode;

    constructor(code: SubscriptionPortErrorCode, message: string = code) {
        super(message);
        this.name = 'SubscriptionPortError';
        this.code = code;
    }
}

export const isPortError = (error: unknown, code?: SubscriptionPortErrorCode): error is SubscriptionPortError =>
    error instanceof SubscriptionPortError && (code === undefined || error.code === code);
