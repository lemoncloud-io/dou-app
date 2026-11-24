import { formatMoney } from './money';

describe('formatMoney', () => {
    it('reads a dollar amount in cents and a won amount in won', () => {
        expect(formatMoney({ amount: 680, currency: 'USD' }, 'en')).toBe('$6.80');
        expect(formatMoney({ amount: 8900, currency: 'KRW' }, 'ko')).toBe('₩8,900');
    });
});
