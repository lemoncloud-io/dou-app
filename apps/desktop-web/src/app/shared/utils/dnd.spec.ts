import { describe, expect, it } from 'vitest';

import { isDndActive, isSnoozed, isWithinQuietHours, nextDndBoundary, nextSnoozeUntilTomorrow } from './dnd';

const at = (h: number, m = 0): Date => new Date(2026, 5, 18, h, m, 0, 0);

describe('isWithinQuietHours', () => {
    it('returns false without a window', () => {
        expect(isWithinQuietHours(null, at(3))).toBe(false);
    });

    it('matches a same-day window (09:00–17:00)', () => {
        const q = { start: '09:00', end: '17:00' };
        expect(isWithinQuietHours(q, at(8, 59))).toBe(false);
        expect(isWithinQuietHours(q, at(9, 0))).toBe(true); // inclusive start
        expect(isWithinQuietHours(q, at(16, 59))).toBe(true);
        expect(isWithinQuietHours(q, at(17, 0))).toBe(false); // exclusive end
    });

    it('matches a midnight-crossing window (22:00–07:00)', () => {
        const q = { start: '22:00', end: '07:00' };
        expect(isWithinQuietHours(q, at(23, 30))).toBe(true);
        expect(isWithinQuietHours(q, at(6, 59))).toBe(true);
        expect(isWithinQuietHours(q, at(7, 0))).toBe(false);
        expect(isWithinQuietHours(q, at(12, 0))).toBe(false);
    });

    it('treats equal start/end and malformed values as no window', () => {
        expect(isWithinQuietHours({ start: '08:00', end: '08:00' }, at(8))).toBe(false);
        expect(isWithinQuietHours({ start: 'bad', end: '07:00' }, at(3))).toBe(false);
        expect(isWithinQuietHours({ start: '25:00', end: '07:00' }, at(3))).toBe(false);
    });
});

describe('isDndActive', () => {
    const now = at(12).getTime();

    it('is active while a snooze is in the future', () => {
        expect(isDndActive({ snoozeUntil: now + 60_000, quietHours: null }, now)).toBe(true);
    });

    it('ignores an expired snooze', () => {
        expect(isDndActive({ snoozeUntil: now - 1, quietHours: null }, now)).toBe(false);
        expect(isDndActive({ snoozeUntil: null, quietHours: null }, now)).toBe(false);
    });

    it('is active inside quiet hours even without a snooze', () => {
        expect(isDndActive({ snoozeUntil: null, quietHours: { start: '11:00', end: '13:00' } }, now)).toBe(true);
    });
});

describe('isSnoozed', () => {
    const now = at(12).getTime();

    it('holds while the snooze is in the future', () => {
        expect(isSnoozed(now + 60_000, now)).toBe(true);
    });

    it('releases an expired or absent snooze', () => {
        expect(isSnoozed(now - 1, now)).toBe(false);
        expect(isSnoozed(null, now)).toBe(false);
        expect(isSnoozed(undefined, now)).toBe(false);
    });
});

describe('nextSnoozeUntilTomorrow', () => {
    it('returns today when the hour is still ahead', () => {
        const now = at(6).getTime();
        expect(nextSnoozeUntilTomorrow(now, 8)).toBe(at(8).getTime());
    });

    it('rolls to tomorrow when the hour has passed', () => {
        const now = at(9).getTime();
        const result = new Date(nextSnoozeUntilTomorrow(now, 8));
        expect(result.getDate()).toBe(19);
        expect(result.getHours()).toBe(8);
    });
});

describe('nextDndBoundary', () => {
    it('returns null when nothing mutes', () => {
        expect(nextDndBoundary({ snoozeUntil: null, quietHours: null }, at(12).getTime())).toBeNull();
    });

    it('names a live snooze over later quiet edges', () => {
        const now = at(12).getTime();
        expect(
            nextDndBoundary({ snoozeUntil: now + 30 * 60_000, quietHours: { start: '22:00', end: '07:00' } }, now)
        ).toBe(now + 30 * 60_000);
    });

    it('names the next quiet edge when the snooze already passed', () => {
        const now = at(21).getTime();
        expect(
            nextDndBoundary({ snoozeUntil: now - 1, quietHours: { start: '22:00', end: '07:00' } }, now)
        ).toBe(at(22).getTime());
    });

    it('rolls a same-day window edge to tomorrow once passed', () => {
        const now = at(18).getTime();
        const edge = new Date(
            nextDndBoundary({ snoozeUntil: null, quietHours: { start: '09:00', end: '17:00' } }, now) ?? 0
        );
        expect(edge.getDate()).toBe(19);
        expect(edge.getHours()).toBe(9);
    });
});
