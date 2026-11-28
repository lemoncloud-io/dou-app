import * as checkoutWeb from '@chatic/checkout-web';
import * as subscription from '@chatic/subscription';

import * as webCheckout from './index';

describe('the old web-checkout entry', () => {
    it('re-exports the subscription rules and the web checkout unchanged', () => {
        for (const [name, value] of Object.entries({ ...subscription, ...checkoutWeb })) {
            expect(webCheckout[name as keyof typeof webCheckout]).toBe(value);
        }
        expect(Object.keys(webCheckout).sort()).toEqual(
            [...new Set([...Object.keys(subscription), ...Object.keys(checkoutWeb)])].sort()
        );
    });

    it('still names what the two apps call', () => {
        expect(typeof webCheckout.createPaymentPort).toBe('function');
        expect(typeof webCheckout.planCatalogIn).toBe('function');
        expect(typeof webCheckout.SubscriptionPortError).toBe('function');
        expect(webCheckout.HTTP_METHODS).toBeDefined();
    });
});
