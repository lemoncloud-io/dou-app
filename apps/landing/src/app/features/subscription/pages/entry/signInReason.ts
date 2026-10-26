import { isPortError } from '../../lib/port';

/** Why the sign-in page is shown again, as its `reason` query names it. */
export type SignInReason = 'canceled' | 'expired-attempt' | 'failed' | 'session-ended';

const REASONS: readonly SignInReason[] = ['canceled', 'expired-attempt', 'failed', 'session-ended'];

/** The `reason` query as one the page has a banner for, or `undefined` — anyone can write the query. */
export const signInReasonOf = (value: string | null): SignInReason | undefined =>
    REASONS.find(reason => reason === value);

/**
 * The banner a failed sign-in return comes back with. Only the two outcomes the provider round trip
 * names get their own words; anything else — the network included — is a plain failure to retry.
 */
export const reasonOfSignInError = (error: unknown): SignInReason => {
    if (isPortError(error, 'signInCanceled')) return 'canceled';
    if (isPortError(error, 'signInExpired')) return 'expired-attempt';
    return 'failed';
};
