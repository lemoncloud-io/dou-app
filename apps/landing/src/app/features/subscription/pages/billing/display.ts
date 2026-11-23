import { ddayOf } from '../../lib/ddayOf';

import type { BillingEmailReceives, PaymentMethod, Subscription } from '../../types';

export const cardExpiry = ({ expMonth, expYear }: Pick<PaymentMethod, 'expMonth' | 'expYear'>): string | undefined =>
    expMonth && expYear ? `${String(expMonth).padStart(2, '0')}/${String(expYear % 100).padStart(2, '0')}` : undefined;

export const cardExpiryMonth = ({
    expMonth,
    expYear,
}: Pick<PaymentMethod, 'expMonth' | 'expYear'>): string | undefined =>
    expMonth && expYear ? `${expYear}.${String(expMonth).padStart(2, '0')}` : undefined;

export const addedCardOf = (before: PaymentMethod[], after: PaymentMethod[]): PaymentMethod | undefined => {
    const known = new Set(before.map(pm => pm.id));
    return after.find(pm => !known.has(pm.id));
};

export const regionName = (code: string, lang: string): string => {
    try {
        return new Intl.DisplayNames([lang], { type: 'region' }).of(code) ?? code;
    } catch {
        return code;
    }
};

const RECEIVE_ORDER: BillingEmailReceives = ['receipt', 'notice'];

export const toggleReceive = (
    receives: BillingEmailReceives,
    kind: BillingEmailReceives[number],
    on: boolean
): BillingEmailReceives => RECEIVE_ORDER.filter(k => (k === kind ? on : receives.includes(k)));

export const nextRetryOf = (sub: Subscription | undefined, today: Date): string | undefined =>
    sub?.retryAt?.find(day => ddayOf(day, today) >= 0);
