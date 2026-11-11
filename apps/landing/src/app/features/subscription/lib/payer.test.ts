import { isMobilePhone, isPayerComplete, isPayerName, normalizePhone, payerOf } from './payer';

describe('payer', () => {
    it('takes a mobile number with or without separators, and nothing else', () => {
        expect(normalizePhone('010-1234-5678')).toBe('01012345678');
        expect(isMobilePhone('010-1234-5678')).toBe(true);
        expect(isMobilePhone('011 123 4567')).toBe(true);
        expect(isMobilePhone('02-1234-5678')).toBe(false);
        expect(isMobilePhone('0101234')).toBe(false);
        expect(isMobilePhone('')).toBe(false);
    });

    it('holds a name to the card company limit of 30 bytes', () => {
        expect(isPayerName('김민지')).toBe(true);
        expect(isPayerName('   ')).toBe(false);
        // Ten Korean syllables are 30 bytes in UTF-8; the eleventh is one too many.
        expect(isPayerName('가'.repeat(10))).toBe(true);
        expect(isPayerName('가'.repeat(11))).toBe(false);
        expect(isPayerName('a'.repeat(30))).toBe(true);
        expect(isPayerName('a'.repeat(31))).toBe(false);
    });

    it('is complete only with both fields valid', () => {
        expect(isPayerComplete({ name: '김민지', phone: '01012345678' })).toBe(true);
        expect(isPayerComplete({ name: '김민지', phone: '' })).toBe(false);
        expect(isPayerComplete({ name: '', phone: '01012345678' })).toBe(false);
    });

    it('hands the port a trimmed name, a bare number and the billing address', () => {
        expect(payerOf({ name: ' 김민지 ', phone: '010-1234-5678' }, 'minji.kim@gmail.com')).toEqual({
            name: '김민지',
            phone: '01012345678',
            email: 'minji.kim@gmail.com',
        });
    });
});
