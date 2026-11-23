import { dayNumber, toIsoDate } from './calendar';

export const ddayOf = (target: string, now: Date): number => dayNumber(target) - dayNumber(toIsoDate(now));
