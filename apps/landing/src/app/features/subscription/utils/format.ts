import type { Money } from '../types';

/**
 * An amount as the designs print it: `₩17,200`, `$12.00`. `money.amount` is in the currency's minor
 * unit, so it is divided by the currency's own fraction digits — none for won, two for dollars, and
 * so `600` cents prints as `$6.00`. The locale only decides separators — the symbol always follows the
 * currency.
 */
export const formatMoney = (money: Money, lang: string): string => {
    const format = new Intl.NumberFormat(lang.startsWith('ko') ? 'ko-KR' : 'en-US', {
        style: 'currency',
        currency: money.currency,
        currencyDisplay: 'narrowSymbol',
    });
    const digits = format.resolvedOptions().maximumFractionDigits ?? 0;
    return format.format(money.amount / 10 ** digits);
};

/** `2026.11.20` — the app's date format, in every language. Takes an ISO date or date-time. */
export const formatDate = (iso: string): string => iso.slice(0, 10).replace(/-/g, '.');
