import { formatCountdownClock, SPACED_CLOCK_SEPARATOR } from './countdownClock';

const at = (days: number, hours: number, minutes: number, seconds: number) => ({ days, hours, minutes, seconds });

describe('formatCountdownClock', () => {
    it('zero-pads every field with a bare colon by default', () => {
        expect(formatCountdownClock(at(0, 3, 4, 5))).toBe('03:04:05');
    });

    it('spaces the colons out on the invite screens', () => {
        expect(formatCountdownClock(at(0, 0, 9, 5), SPACED_CLOCK_SEPARATOR)).toBe('00 : 09 : 05');
    });

    it('folds the days into the hours instead of wrapping', () => {
        expect(formatCountdownClock(at(1, 3, 0, 0), SPACED_CLOCK_SEPARATOR)).toBe('27 : 00 : 00');
    });

    it('reads all zeros at expiry', () => {
        expect(formatCountdownClock(at(0, 0, 0, 0), SPACED_CLOCK_SEPARATOR)).toBe('00 : 00 : 00');
    });
});
