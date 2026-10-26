import { describe, expect, it } from 'vitest';

import { formatAgo, formatClock, formatDateTime, formatDuration, formatNumber } from './timeFormat';

const AT = Date.parse('2026-10-26T14:03:27+09:00');

describe('timeFormat', () => {
    it('shows Korean time in both languages and names the zone', () => {
        expect(formatDateTime(AT, 'ko')).toBe('10월 26일 14:03 KST');
        expect(formatDateTime(AT, 'en')).toBe('Oct 26, 14:03 KST');
        expect(formatClock(AT, 'en')).toBe('14:03:27');
        expect(formatDateTime(undefined, 'ko')).toBe('-');
    });

    it('says how long ago in the viewer language', () => {
        expect(formatAgo(AT - 5 * 60_000, 'ko', AT)).toBe('5분 전');
        expect(formatAgo(AT - 5 * 60_000, 'en', AT)).toBe('5 minutes ago');
        expect(formatAgo(AT - 10_000, 'en', AT)).toBe('now');
        expect(formatAgo(AT - 3 * 86_400_000, 'ko', AT)).toBe('3일 전');
    });

    it('formats durations from milliseconds up to hours', () => {
        expect(formatDuration(850, 'en')).toBe('850ms');
        expect(formatDuration(1_250, 'en')).toBe('1.3s');
        expect(formatDuration(65_000, 'ko')).toBe('1분 5초');
        expect(formatDuration(3_660_000, 'en')).toBe('1h 1m');
    });

    it('groups digits', () => {
        expect(formatNumber(12_345, 'ko')).toBe('12,345');
    });
});
