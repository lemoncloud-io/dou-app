import { formatPlanPrice } from './price';

describe('formatPlanPrice', () => {
    it('스토어 문자열을 그대로 쓴다 — 이미 현지 통화로 포맷돼 있다', () => {
        expect(formatPlanPrice('₩8,600')).toBe('₩8,600');
        expect(formatPlanPrice('$6.99')).toBe('$6.99');
    });

    it('스토어 가격이 없으면 아무것도 내지 않는다 — 서버 USD로 지어내지 않는다', () => {
        // The server's price is a USD reference value with no way to convert it to KRW, and showing
        // dollars would tell a user billed in KRW the wrong amount.
        expect(formatPlanPrice(undefined)).toBeUndefined();
        expect(formatPlanPrice('')).toBeUndefined();
    });
});
