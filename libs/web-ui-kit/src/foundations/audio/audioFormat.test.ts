import { formatAudioClock, formatAudioMeta, formatAudioSize } from './audioFormat';

describe('formatAudioClock', () => {
    it.each([
        [7, '0:07'],
        [35 * 60 + 47, '35:47'],
        [3600 + 12 * 60 + 5, '1:12:05'],
        [59.9, '0:59'],
        [0, '0:00'],
        [undefined, '0:00'],
        [Number.NaN, '0:00'],
        [-3, '0:00'],
        [Number.POSITIVE_INFINITY, '0:00'],
    ])('formats %p as %p', (seconds, expected) => {
        expect(formatAudioClock(seconds)).toBe(expected);
    });
});

describe('formatAudioSize', () => {
    it.each([
        [17.0 * 1024 * 1024, '17.0MB'],
        [68.4 * 1024 * 1024, '68.4MB'],
        [300 * 1024, '0.3MB'],
        [0, '0.0MB'],
    ])('formats %p bytes as %p', (bytes, expected) => {
        expect(formatAudioSize(bytes)).toBe(expected);
    });

    it('leaves an unknown size out', () => {
        expect(formatAudioSize(undefined)).toBeUndefined();
        expect(formatAudioSize(-1)).toBeUndefined();
    });
});

describe('formatAudioMeta', () => {
    it('joins length and size, or keeps whichever is known', () => {
        expect(formatAudioMeta(2147, 17 * 1024 * 1024)).toBe('35:47 · 17.0MB');
        expect(formatAudioMeta(undefined, 17 * 1024 * 1024)).toBe('17.0MB');
        expect(formatAudioMeta(0, 17 * 1024 * 1024)).toBe('17.0MB');
        expect(formatAudioMeta(65, undefined)).toBe('1:05');
        expect(formatAudioMeta(undefined, undefined)).toBe('');
    });
});
