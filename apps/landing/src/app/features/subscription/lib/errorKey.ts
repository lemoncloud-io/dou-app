import { isPortError } from './port';

/**
 * The copy key for a failure a screen has no words of its own for: the account refused, the request
 * not completing, or anything else. Screens with their own cases check those first and fall back to
 * this.
 */
export const commonErrorKey = (error: unknown): string => {
    if (isPortError(error, 'notAllowed')) return 'subscription.common.error.notAllowed';
    if (isPortError(error, 'network')) return 'subscription.common.error.network';
    return 'subscription.common.error.unknown';
};
