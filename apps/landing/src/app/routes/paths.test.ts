import { ROUTES } from './paths';

// Each of these is a public URL cited from outside the repo; the values are pinned, not derived.
describe('ROUTES', () => {
    it('keeps the home URL', () => {
        expect(ROUTES.root).toBe('/');
    });

    it('keeps the three policy URLs', () => {
        expect(ROUTES.policy).toEqual({
            terms: '/policy/terms',
            privacy: '/policy/privacy',
            child: '/policy/child',
        });
    });
});
