import { formatPhoneNumber, isValidKoreanPhone } from './phone';

describe('phone utils — 한국 휴대폰 번호 검증·표시', () => {
    it('모바일 프리픽스로 시작하는 10-11자리만 유효하다', () => {
        expect(isValidKoreanPhone('01012345678')).toBe(true);
        expect(isValidKoreanPhone('0161234567')).toBe(true);
        expect(isValidKoreanPhone('010123456')).toBe(false); // 9 digits
        expect(isValidKoreanPhone('010123456789')).toBe(false); // 12 digits
        expect(isValidKoreanPhone('02012345678')).toBe(false); // landline-ish prefix
        expect(isValidKoreanPhone('')).toBe(false);
    });

    it('입력 중인 자릿수에 맞춰 대시를 끼워 넣는다', () => {
        expect(formatPhoneNumber('010')).toBe('010');
        expect(formatPhoneNumber('0101234')).toBe('010-1234');
        expect(formatPhoneNumber('01012345678')).toBe('010-1234-5678');
    });
});
