import { ROUTES } from './paths';

// Each of these is a public URL cited from outside the repo; the values are pinned, not derived.
describe('ROUTES', () => {
    it('keeps the home URL', () => {
        expect(ROUTES.root).toBe('/');
    });

    it('keeps the policy URLs', () => {
        expect(ROUTES.policy).toEqual({
            terms: '/policy/terms',
            privacy: '/policy/privacy',
            child: '/policy/child',
            refund: '/policy/refund',
        });
    });

    it('builds a subscription URL with its id encoded', () => {
        expect(ROUTES.subscription.detail('sub-1')).toBe('/subscription/sub-1');
        expect(ROUTES.subscription.cancel('a/b')).toBe('/subscription/a%2Fb/cancel');
    });
});
