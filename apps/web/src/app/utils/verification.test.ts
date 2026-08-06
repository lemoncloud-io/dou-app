import { formatCountdown, isValidEmail } from './verification';

describe('isValidEmail', () => {
    it.each(['a@b.co', 'first.last+tag@sub.example.com'])('accepts %s', email => {
        expect(isValidEmail(email)).toBe(true);
    });

    it.each(['', 'no-at-sign', 'missing@tld', 'spaced out@example.com', 'two@@example.com'])('rejects %p', email => {
        expect(isValidEmail(email)).toBe(false);
    });
});

describe('formatCountdown', () => {
    it('pads both halves to two digits', () => {
        expect(formatCountdown(0)).toBe('00:00');
        expect(formatCountdown(9)).toBe('00:09');
        expect(formatCountdown(60)).toBe('01:00');
        expect(formatCountdown(3 * 60)).toBe('03:00');
    });

    it('keeps counting past an hour rather than wrapping', () => {
        expect(formatCountdown(3661)).toBe('61:01');
    });
});
