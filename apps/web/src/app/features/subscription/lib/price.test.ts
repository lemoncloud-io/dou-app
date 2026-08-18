import { formatPlanPrice } from './price';

describe('formatPlanPrice', () => {
    it('스토어 가격이 있으면 그대로 쓴다 — 이미 현지화된 문자열이다', () => {
        expect(formatPlanPrice('₩8,600', 6, 'ko')).toBe('₩8,600');
        expect(formatPlanPrice('$6.99', 6, 'en')).toBe('$6.99');
    });

    it('스토어 가격이 없으면 서버 값을 달러로 명시한다 — 원화로 위장하지 않는다', () => {
        // 서버 price는 USD 참조값이고 원화 값은 아예 없다. ₩6은 거짓이므로 통화를 숨기지 않는다.
        expect(formatPlanPrice(undefined, 6, 'ko')).toContain('6');
        expect(formatPlanPrice(undefined, 6, 'ko')).not.toContain('₩');
        expect(formatPlanPrice(undefined, 6, 'en-US')).toBe('$6.00');
    });

    it('가격 자체가 없으면 undefined — 호출부가 행을 통째로 감춘다', () => {
        expect(formatPlanPrice(undefined, undefined, 'ko')).toBeUndefined();
        expect(formatPlanPrice(undefined, null, 'ko')).toBeUndefined();
    });

    it('0원 상품도 가격이다 — falsy라고 빠뜨리지 않는다', () => {
        expect(formatPlanPrice(undefined, 0, 'en-US')).toBe('$0.00');
    });
});
