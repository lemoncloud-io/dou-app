import type { RateLimit } from './settings';

export interface Limiter {
    tryAcquire(limit: RateLimit, now: number): boolean;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

const trim = (window: number[], now: number, span: number): void => {
    while (window.length > 0 && now - window[0] >= span) window.shift();
};

export const createLimiter = (): Limiter => {
    const minute: number[] = [];
    const hour: number[] = [];
    return {
        tryAcquire(limit, now) {
            trim(minute, now, MINUTE_MS);
            trim(hour, now, HOUR_MS);
            if (minute.length >= limit.perMinute || hour.length >= limit.perHour) return false;
            minute.push(now);
            hour.push(now);
            return true;
        },
    };
};
