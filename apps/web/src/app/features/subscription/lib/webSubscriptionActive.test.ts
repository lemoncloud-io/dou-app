import {
    asWebSubscriptionActive,
    isWebSubscriptionActiveError,
    WebSubscriptionActiveError,
} from './webSubscriptionActive';

const SERVER = '409 CONFLICT - portone subscription is active - verifyMembershipPurchase(membership/MS1)';

describe('asWebSubscriptionActive', () => {
    it('classifies the relay refusal by message', () => {
        expect(asWebSubscriptionActive(new Error(SERVER))).toBeInstanceOf(WebSubscriptionActiveError);
    });

    it('classifies a status-carrying HTTP error', () => {
        expect(asWebSubscriptionActive({ status: 409, message: 'stripe subscription is active' })).toBeDefined();
        expect(
            asWebSubscriptionActive({ response: { status: 409, data: { message: SERVER } }, message: 'Request failed' })
        ).toBeDefined();
    });

    it('leaves other failures alone', () => {
        expect(asWebSubscriptionActive(new Error('403 INVALID PAYMENT'))).toBeUndefined();
        expect(asWebSubscriptionActive({ status: 409, message: 'something else conflicts' })).toBeUndefined();
        expect(asWebSubscriptionActive({ status: 500, message: 'subscription is active' })).toBeUndefined();
        expect(asWebSubscriptionActive(undefined)).toBeUndefined();
    });

    it('recognises the typed error by code', () => {
        expect(isWebSubscriptionActiveError(new WebSubscriptionActiveError())).toBe(true);
        expect(isWebSubscriptionActiveError({ code: 'user-cancelled' })).toBe(false);
    });
});
