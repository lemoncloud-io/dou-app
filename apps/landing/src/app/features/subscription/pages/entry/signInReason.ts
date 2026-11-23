import { isPortError } from '../../lib/port';

export type SignInReason = 'canceled' | 'expired-attempt' | 'failed' | 'session-ended';

const REASONS: readonly SignInReason[] = ['canceled', 'expired-attempt', 'failed', 'session-ended'];

export const signInReasonOf = (value: string | null): SignInReason | undefined =>
    REASONS.find(reason => reason === value);

export const reasonOfSignInError = (error: unknown): SignInReason => {
    if (isPortError(error, 'signInCanceled')) return 'canceled';
    if (isPortError(error, 'signInExpired')) return 'expired-attempt';
    return 'failed';
};
