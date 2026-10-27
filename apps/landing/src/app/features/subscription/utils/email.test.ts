import { isEmailAddress } from './email';

describe('isEmailAddress', () => {
    it.each(['a@b.co', ' billing@minji-studio.kr '])('accepts %s', value => {
        expect(isEmailAddress(value)).toBe(true);
    });

    it.each(['', 'a@b', 'a b@c.co', '@c.co', 'a@.'])('refuses %s', value => {
        expect(isEmailAddress(value)).toBe(false);
    });
});
