import * as PortOne from '@portone/browser-sdk/v2';

import type { PaymentWindow, PaymentWindowResult } from './createHttpPort';

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
 * The payment provider's card window (PortOne V2, KG Inicis). Every value it opens with comes from the
 * server's `issue` answer — the store, the channel and the issue id — so none is configured here; the
 * card company also requires the holder's name, number and email with the card.
 */
export const portOneWindow: PaymentWindow = async ({ issue, payer }) => {
    const response = await PortOne.requestIssueBillingKey({
        storeId: issue.storeId,
        channelKey: issue.channelKey,
        billingKeyMethod: 'CARD',
        issueId: issue.issueId,
        issueName: issue.issueName,
        customer: {
            customerId: issue.customerId,
            fullName: payer.name,
            phoneNumber: payer.phone,
            email: payer.email,
        },
    });
    return windowResultOf(response);
};
