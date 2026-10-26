import { sessionEndedRedirect, signInRedirect } from './sessionEnded';

describe('sessionEndedRedirect', () => {
    it('sends the reader to sign in, with the reason and the page they were on', () => {
        expect(sessionEndedRedirect({ pathname: '/subscription/checkout/status', search: '?attempt=att-1' })).toBe(
            '/subscription/login?reason=session-ended&next=%2Fsubscription%2Fcheckout%2Fstatus%3Fattempt%3Datt-1'
        );
    });

    it('leaves a sign-in page where it is', () => {
        expect(sessionEndedRedirect({ pathname: '/subscription/login', search: '?next=x' })).toBeUndefined();
        expect(sessionEndedRedirect({ pathname: '/subscription/login/callback', search: '' })).toBeUndefined();
    });
});

describe('signInRedirect', () => {
    it('carries the page as next and no reason', () => {
        expect(signInRedirect({ pathname: '/subscription/history', search: '' })).toBe(
            '/subscription/login?next=%2Fsubscription%2Fhistory'
        );
    });
});
