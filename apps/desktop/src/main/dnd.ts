import type { SetNotificationPrefsPayload } from '@chatic/app-messages';

/**
 * DND evaluation for main-process OS banners. Pure-function copy of
 * apps/desktop-web/src/app/shared/utils/dnd.ts (the shell doesn't consume
 * desktop-web app source) — keep the two in sync. The renderer mirrors its
 * prefs here via the SetNotificationPrefs bridge message; evaluation happens at
 * show time so a quiet-hours boundary crossing needs no re-send.
 */

/** Parse "HH:MM" (24h) into minutes since midnight; null when malformed. */
const toMinutes = (hhmm: string): number | null => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
};

/** Is `now` inside the quiet-hours window? Handles a midnight-crossing window (start > end). */
const isWithinQuietHours = (q: SetNotificationPrefsPayload['quietHours'], now: Date): boolean => {
    if (!q) return false;
    const start = toMinutes(q.start);
    const end = toMinutes(q.end);
    if (start === null || end === null || start === end) return false;
    const current = now.getHours() * 60 + now.getMinutes();
    return start < end ? current >= start && current < end : current >= start || current < end;
};

/** Should the shell suppress an OS banner right now, per the renderer's mirrored prefs? */
export const isBannerSuppressed = (prefs: SetNotificationPrefsPayload | null, now: number = Date.now()): boolean => {
    if (!prefs) return false; // no snapshot yet (old web / early boot) — stay ungated
    if (!prefs.enabled) return true;
    if (prefs.snoozeUntil != null && prefs.snoozeUntil > now) return true;
    return isWithinQuietHours(prefs.quietHours, new Date(now));
};
