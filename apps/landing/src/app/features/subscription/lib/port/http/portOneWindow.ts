import * as PortOne from '@portone/browser-sdk/v2';

import type { PaymentWindow, PaymentWindowResult } from './createHttpPort';

/**
 * What the payment provider's window answered. A `code` is a failure and a `billingKey` the card.
 * No answer at all is the window gone without a result.
 *
 * The code a window closed by the reader reports is not documented, and has not been measured on the
 * test channel yet, so until it is every code reads as a failure — the screens then offer to try again
 * either way.
 */
export const windowResultOf = (
    response: { code?: string; billingKey?: string } | undefined | null
): PaymentWindowResult => {
    if (!response) return { outcome: 'closed' };
    if (response.code || !response.billingKey) return { outcome: 'failed' };
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
