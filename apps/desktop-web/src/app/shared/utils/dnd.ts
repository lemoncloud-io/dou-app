import type { QuietHours } from '../stores';

/** Parse "HH:MM" (24h) into minutes since midnight; null when malformed. */
const toMinutes = (hhmm: string): number | null => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
};

/**
 * Is `now` inside the quiet-hours window? Handles a window that crosses
 * midnight (start > end) — e.g. 22:00–07:00 is quiet late at night AND early
 * morning. Equal start/end is treated as no window (never quiet).
 */
export const isWithinQuietHours = (q: QuietHours | null | undefined, now: Date): boolean => {
    if (!q) return false;
    const start = toMinutes(q.start);
    const end = toMinutes(q.end);
    if (start === null || end === null || start === end) return false;
    const current = now.getHours() * 60 + now.getMinutes();
    // Same-day window vs. midnight-crossing window.
    return start < end ? current >= start && current < end : current >= start || current < end;
};

/** Active "do not disturb": a live snooze, or inside the quiet-hours window. */
export const isDndActive = (
    state: { snoozeUntil: number | null; quietHours: QuietHours | null },
    now: number = Date.now()
): boolean => {
    if (state.snoozeUntil != null && state.snoozeUntil > now) return true;
    return isWithinQuietHours(state.quietHours, new Date(now));
};

/** Epoch ms for the next local `hour:00` — today if still ahead, else tomorrow. */
export const nextSnoozeUntilTomorrow = (now: number, hour = 8): number => {
    const target = new Date(now);
    target.setHours(hour, 0, 0, 0);
    if (target.getTime() <= now) target.setDate(target.getDate() + 1);
    return target.getTime();
};
