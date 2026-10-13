import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatClockTime, formatListTime, formatShortDate } from './formatDate';

describe('formatListTime', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 9, 13, 15, 0));
    });
    afterEach(() => vi.useRealTimers());

    it('gives the clock time for something that happened today', () => {
        const ms = new Date(2026, 9, 13, 9, 5).getTime();
        expect(formatListTime(ms)).toBe(formatClockTime(ms));
    });

    it('gives the short date for anything before today', () => {
        const ms = new Date(2026, 9, 12, 23, 59).getTime();
        expect(formatListTime(ms)).toBe(formatShortDate(ms));
    });

    it('gives nothing for a missing time', () => {
        expect(formatListTime(undefined)).toBe('');
    });
});
