import { routeTemplateOf } from './routeTemplate';

describe('routeTemplateOf', () => {
    it('turns a path with ids into its template', () => {
        expect(routeTemplateOf('/channels/U:1002053/room')).toBe('/channels/:id/room');
        expect(routeTemplateOf('/channels/C1/thread/42')).toBe('/channels/:id/thread/:id2');
        expect(routeTemplateOf('/place/P9/settings/members')).toBe('/place/:id/settings/members');
    });

    it('keeps a static path as it is, and prefers it over a parameter', () => {
        expect(routeTemplateOf('/')).toBe('/');
        expect(routeTemplateOf('/mypage/settings')).toBe('/mypage/settings');
        expect(routeTemplateOf('/channels/start-dm')).toBe('/channels/start-dm');
    });

    it('has no template for a path no route defines, rather than the path itself', () => {
        expect(routeTemplateOf('/nowhere/at/all')).toBeUndefined();
        expect(routeTemplateOf(undefined)).toBeUndefined();
    });
});
