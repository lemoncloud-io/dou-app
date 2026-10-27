import { ddayOf } from '../../lib/ddayOf';

import type { BillingEmailReceives, PaymentMethod, Subscription } from '../../types';

/** A card's expiry as the card prints it: `08/28`. */
export const cardExpiry = ({ expMonth, expYear }: Pick<PaymentMethod, 'expMonth' | 'expYear'>): string =>
    `${String(expMonth).padStart(2, '0')}/${String(expYear % 100).padStart(2, '0')}`;

/** A card's expiry as a month in the app's date format: `2026.11`. */
export const cardExpiryMonth = ({ expMonth, expYear }: Pick<PaymentMethod, 'expMonth' | 'expYear'>): string =>
    `${expYear}.${String(expMonth).padStart(2, '0')}`;

/**
 * The card a registration added, found by comparing the list before and after it. The provider's
 * window answers only with an outcome, so this is how the page learns which card to name in its
 * toast and, while a payment is failing, which card to offer as the replacement.
 */
export const addedCardOf = (before: PaymentMethod[], after: PaymentMethod[]): PaymentMethod | undefined => {
    const known = new Set(before.map(pm => pm.id));
    return after.find(pm => !known.has(pm.id));
};

/**
 * A billing country code in the reader's language (`KR` → `대한민국` / `South Korea`). Falls back to the
 * code itself where the runtime has no region names.
 */
export const regionName = (code: string, lang: string): string => {
    try {
        return new Intl.DisplayNames([lang], { type: 'region' }).of(code) ?? code;
    } catch {
        return code;
    }
};

const RECEIVE_ORDER: BillingEmailReceives = ['receipt', 'notice'];

/** The kinds of billing mail an address receives once `kind` is switched on or off, in a stable order. */
export const toggleReceive = (
    receives: BillingEmailReceives,
    kind: BillingEmailReceives[number],
    on: boolean
): BillingEmailReceives => RECEIVE_ORDER.filter(k => (k === kind ? on : receives.includes(k)));

/**
 * The next day a failed charge is tried again, if one is still to come: today counts, a day already
 * passed does not. Only a subscription whose payment is failing carries a retry schedule.
 */
export const nextRetryOf = (sub: Subscription | undefined, today: Date): string | undefined =>
    sub?.retryAt?.find(day => ddayOf(day, today) >= 0);
