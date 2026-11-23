import { isPortError } from './port';

export const commonErrorKey = (error: unknown): string => {
    if (isPortError(error, 'notAllowed')) return 'subscription.common.error.notAllowed';
    if (isPortError(error, 'network')) return 'subscription.common.error.network';
    return 'subscription.common.error.unknown';
};
