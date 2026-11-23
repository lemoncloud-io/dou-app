import type { Money } from '../types';

export const formatMoney = (money: Money, lang: string): string => {
    const format = new Intl.NumberFormat(lang.startsWith('ko') ? 'ko-KR' : 'en-US', {
        style: 'currency',
        currency: money.currency,
        currencyDisplay: 'narrowSymbol',
    });
    const digits = format.resolvedOptions().maximumFractionDigits ?? 0;
    return format.format(money.amount / 10 ** digits);
};

export const formatDate = (iso: string): string => iso.slice(0, 10).replace(/-/g, '.');
