import type { PaymentWindowResult } from './paymentPort';

const USER_CANCELLED = /취소/;

export const windowResultOf = (
    response: { code?: string; message?: string; pgMessage?: string; billingKey?: string } | undefined | null
): PaymentWindowResult => {
    if (!response) return { outcome: 'closed' };
    if (response.code) {
        const said = `${response.message ?? ''} ${response.pgMessage ?? ''}`;
        return { outcome: USER_CANCELLED.test(said) ? 'closed' : 'failed' };
    }
    if (!response.billingKey) return { outcome: 'failed' };
    return { outcome: 'registered', billingKey: response.billingKey };
};

export const windowResultOfQuery = (params: URLSearchParams): PaymentWindowResult | undefined => {
    if (!params.has('billingKey') && !params.has('code')) return undefined;
    return windowResultOf({
        code: params.get('code') ?? undefined,
        message: params.get('message') ?? undefined,
        pgMessage: params.get('pgMessage') ?? undefined,
        billingKey: params.get('billingKey') ?? undefined,
    });
};
