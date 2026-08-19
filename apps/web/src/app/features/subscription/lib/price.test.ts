import { formatPlanPrice } from './price';

describe('formatPlanPrice', () => {
    it('스토어 문자열을 그대로 쓴다 — 이미 현지 통화로 포맷돼 있다', () => {
        expect(formatPlanPrice('₩8,600')).toBe('₩8,600');
        expect(formatPlanPrice('$6.99')).toBe('$6.99');
    });

    it('스토어 가격이 없으면 아무것도 내지 않는다 — 서버 USD로 지어내지 않는다', () => {
        // 서버 price는 USD 참조값이라 원화로 바꿀 방법이 없고, 달러로 보여주면
        // 원화로 청구되는 사용자에게 틀린 금액을 말하게 된다.
        expect(formatPlanPrice(undefined)).toBeUndefined();
        expect(formatPlanPrice('')).toBeUndefined();
    });
});
