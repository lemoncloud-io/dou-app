import type { Money } from '../types';

/**
 * An amount as the designs print it: `₩17,200`, `$12.00`. Won has no minor unit, so it never shows
 * decimals. The locale only decides separators — the symbol always follows the currency.
 */
export const formatMoney = (money: Money, lang: string): string =>
    new Intl.NumberFormat(lang.startsWith('ko') ? 'ko-KR' : 'en-US', {
        style: 'currency',
        currency: money.currency,
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: money.currency === 'KRW' ? 0 : 2,
        maximumFractionDigits: money.currency === 'KRW' ? 0 : 2,
    }).format(money.amount);

/** `2026.11.20` — the app's date format, in every language. Takes an ISO date or date-time. */
export const formatDate = (iso: string): string => iso.slice(0, 10).replace(/-/g, '.');
