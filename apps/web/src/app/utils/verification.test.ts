import { EmailVerifyRefusal, formatCountdown, isEmailVerifyRefusal, isValidEmail } from './verification';

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

describe('isEmailVerifyRefusal', () => {
    it('recognises a deliberate refusal so its wording can reach the user', () => {
        expect(isEmailVerifyRefusal(new EmailVerifyRefusal('이미 사용 중인 이메일이에요'))).toBe(true);
    });

    it('does NOT match a failed request — that message is backend wording', () => {
        // The whole point: `throwIfApiError` re-throws server text and axios throws its own, and
        // neither belongs in a toast.
        expect(isEmailVerifyRefusal(new Error('403 FORBIDDEN - membership is not valid'))).toBe(false);
        expect(isEmailVerifyRefusal(new Error('Request failed with status code 500'))).toBe(false);
    });

    it('does not choke on non-errors', () => {
        expect(isEmailVerifyRefusal(undefined)).toBe(false);
        expect(isEmailVerifyRefusal('nope')).toBe(false);
    });
});
