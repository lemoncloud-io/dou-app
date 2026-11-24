import { dayNumber, toIsoDate } from '@chatic/web-checkout';

export const ddayOf = (target: string, now: Date): number => dayNumber(target) - dayNumber(toIsoDate(now));
