import * as PortOne from '@portone/browser-sdk/v2';

import type { PaymentWindow } from './createHttpPort';
import { windowResultOf } from './windowReturn';

/**
 * The payment provider's card window (PortOne V2, KG Inicis). Every value it opens with comes from the
 * server's `issue` answer — the store, the channel and the issue id — so none is configured here; the
 * card company also requires the holder's name, number and email with the card.
 */
export const portOneWindow: PaymentWindow = async ({ issue, payer, redirectUrl }) => {
    const response = await PortOne.requestIssueBillingKey({
        storeId: issue.storeId,
        channelKey: issue.channelKey,
        billingKeyMethod: 'CARD',
        issueId: issue.issueId,
        issueName: issue.issueName,
        // On a phone the provider opens its window by leaving the page, and comes back here with the result;
        // where the window stays in the page this is not used.
        redirectUrl,
        customer: {
            customerId: issue.customerId,
            fullName: payer.name,
            phoneNumber: payer.phone,
            email: payer.email,
        },
    });
    return windowResultOf(response);
};
