import type { QuietHours } from '../stores';
import { parseHourMinute } from './formatDate';

export const isWithinQuietHours = (q: QuietHours | null | undefined, now: Date): boolean => {
    if (!q) return false;
    const start = parseHourMinute(q.start);
    const end = parseHourMinute(q.end);
    if (start === null || end === null || start === end) return false;
    const current = now.getHours() * 60 + now.getMinutes();
    return start < end ? current >= start && current < end : current >= start || current < end;
};

export const isDndActive = (
    state: { snoozeUntil: number | null; quietHours: QuietHours | null },
    now: number = Date.now()
): boolean => isSnoozed(state.snoozeUntil, now) || isWithinQuietHours(state.quietHours, new Date(now));

export const isSnoozed = (snoozeUntil: number | null | undefined, now: number = Date.now()): boolean =>
    snoozeUntil != null && snoozeUntil > now;

export const nextSnoozeUntilTomorrow = (now: number, hour = 8): number => {
    const target = new Date(now);
    target.setHours(hour, 0, 0, 0);
    if (target.getTime() <= now) target.setDate(target.getDate() + 1);
    return target.getTime();
};

export const nextDndBoundary = (
    state: { snoozeUntil: number | null; quietHours: QuietHours | null },
    now: number = Date.now()
): number | null => {
    const targets: number[] = [];
    if (state.snoozeUntil != null && state.snoozeUntil > now) targets.push(state.snoozeUntil);
    const start = state.quietHours ? parseHourMinute(state.quietHours.start) : null;
    const end = state.quietHours ? parseHourMinute(state.quietHours.end) : null;
    if (start !== null && end !== null && start !== end) {
        const midnight = new Date(now);
        midnight.setHours(0, 0, 0, 0);
        const day = 24 * 60 * 60 * 1000;
        for (const dayOffset of [0, day]) {
            for (const minutes of [start, end]) {
                const edge = midnight.getTime() + dayOffset + minutes * 60_000;
                if (edge > now) targets.push(edge);
            }
        }
    }
    return targets.length > 0 ? Math.min(...targets) : null;
};
