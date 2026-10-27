import { formatDate, formatMoney } from './format';

describe('formatMoney', () => {
    it('prints won with a symbol and no decimals in either language', () => {
        expect(formatMoney({ amount: 17200, currency: 'KRW' }, 'ko')).toBe('₩17,200');
        expect(formatMoney({ amount: 17200, currency: 'KRW' }, 'en')).toBe('₩17,200');
    });

    it('prints dollars with cents', () => {
        expect(formatMoney({ amount: 12, currency: 'USD' }, 'en')).toBe('$12.00');
    });
});

describe('formatDate', () => {
    it('prints a date with dots', () => {
        expect(formatDate('2026-11-20')).toBe('2026.11.20');
    });

    it('drops the time of a date-time', () => {
        expect(formatDate('2026-11-20T09:30:00.000Z')).toBe('2026.11.20');
    });
});
