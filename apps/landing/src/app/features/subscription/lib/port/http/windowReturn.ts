import type { PaymentWindowResult } from './createHttpPort';

/**
 * What the payment provider's window answered. A `code` is a failure and a `billingKey` the card.
 * No answer at all is the window gone without a result.
 *
 * A reader closing the window is not told apart by its code: measured on the test channel, closing it
 * (and confirming the card company's "cancel?" question) answers `FAILURE_TYPE_PG`, the same code a
 * refused card gets, with a message that the user cancelled the issuing. The message is therefore the
 * only tell, so the match is on its Korean word for cancelling; anything else with a code is a failure.
 */
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

/**
 * The same answer when the window left the page: the provider returns to `redirectUrl` with the result
 * in the query (`billingKey`, or `code` and `message`). A return with neither says nothing, and is not
 * taken for a closed window.
 */
export const windowResultOfQuery = (params: URLSearchParams): PaymentWindowResult | undefined => {
    if (!params.has('billingKey') && !params.has('code')) return undefined;
    return windowResultOf({
        code: params.get('code') ?? undefined,
        message: params.get('message') ?? undefined,
        pgMessage: params.get('pgMessage') ?? undefined,
        billingKey: params.get('billingKey') ?? undefined,
    });
};
