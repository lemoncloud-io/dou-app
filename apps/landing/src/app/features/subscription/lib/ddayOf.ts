import { dayNumber, toIsoDate } from './calendar';

/**
 * Days left until `target`, counted in calendar days from the reader's today: 0 on the day itself,
 * negative once it has passed. The payment-failure and end-of-subscription banners print this.
 */
export const ddayOf = (target: string, now: Date): number => dayNumber(target) - dayNumber(toIsoDate(now));
