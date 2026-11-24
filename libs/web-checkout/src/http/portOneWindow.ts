import * as PortOne from '@portone/browser-sdk/v2';

import type { PaymentWindow } from './paymentPort';
import { windowResultOf } from './windowReturn';

export const portOneWindow: PaymentWindow = async ({ issue, payer, redirectUrl }) => {
    if (issue.provider !== 'portone') throw new Error('not a card registration for the provider window');
    const response = await PortOne.requestIssueBillingKey({
        storeId: issue.storeId,
        channelKey: issue.channelKey,
        billingKeyMethod: 'CARD',
        issueId: issue.issueId,
        issueName: issue.issueName,
        redirectUrl,
        offerPeriod: { interval: '1m' },
        customer: {
            customerId: issue.customerId,
            fullName: payer?.name,
            phoneNumber: payer?.phone,
            email: payer?.email,
        },
    });
    return windowResultOf(response);
};
