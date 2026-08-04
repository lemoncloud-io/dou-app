import { formatKoreanPhone, isValidKoreanPhone, normalizeKoreanPhone } from './koreanPhone';

describe('normalizeKoreanPhone', () => {
    it('+82 국제 형식을 로컬(0…) 형식으로 바꾼다', () => {
        expect(normalizeKoreanPhone('821012345678')).toBe('01012345678');
    });

    it('이미 로컬 형식이면 그대로 둔다', () => {
        expect(normalizeKoreanPhone('01012345678')).toBe('01012345678');
    });

    it('82로 시작해도 길이가 짧으면(국가번호가 아닐 수 있음) 건드리지 않는다', () => {
        expect(normalizeKoreanPhone('8212')).toBe('8212');
    });
});

describe('isValidKoreanPhone', () => {
    it('유효한 010 번호를 인정한다', () => {
        expect(isValidKoreanPhone('01012345678')).toBe(true);
    });

    it('국제 형식으로 들어와도 정규화 후 검증한다', () => {
        expect(isValidKoreanPhone('821012345678')).toBe(true);
    });

    it('010/011/016/017/018/019 이외의 접두사는 거부한다', () => {
        expect(isValidKoreanPhone('02012345678')).toBe(false);
    });

    it('자릿수가 10~11자가 아니면 거부한다', () => {
        expect(isValidKoreanPhone('0101234')).toBe(false);
        expect(isValidKoreanPhone('010123456789')).toBe(false);
    });

    it('10자리 010 번호도 인정한다', () => {
        expect(isValidKoreanPhone('0101234567')).toBe(true);
    });
});

describe('formatKoreanPhone', () => {
    it('입력 중인 짧은 자릿수는 그대로 보여준다', () => {
        expect(formatKoreanPhone('010')).toBe('010');
    });

    it('중간 자릿수는 3-4 구간으로 나눈다', () => {
        expect(formatKoreanPhone('0101234')).toBe('010-1234');
    });

    it('완성된 번호는 3-4-4로 나눈다', () => {
        expect(formatKoreanPhone('01012345678')).toBe('010-1234-5678');
    });
});
