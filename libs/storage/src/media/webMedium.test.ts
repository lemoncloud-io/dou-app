import { WebMedium } from './webMedium';

describe('WebMedium', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it('writes through to the web storage it wraps', () => {
        const medium = WebMedium.local();
        medium.set('k', 'v');
        expect(localStorage.getItem('k')).toBe('v');
        medium.remove('k');
        expect(localStorage.getItem('k')).toBeNull();
    });

    it('answers with what the storage holds now, including writes made around it', () => {
        const medium = WebMedium.session();
        sessionStorage.setItem('k', 'outside');
        expect(medium.get('k')).toBe('outside');
        expect(medium.keys()).toEqual(['k']);
    });

    it('keeps local and session storage apart', () => {
        WebMedium.session().set('k', 'session');
        expect(localStorage.getItem('k')).toBeNull();
        expect(WebMedium.local().get('k')).toBeNull();
    });

    it('falls back to memory when there is no web storage', () => {
        const medium = WebMedium.over(undefined);
        medium.set('k', 'v');
        expect(medium.get('k')).toBe('v');
        expect(localStorage.getItem('k')).toBeNull();
    });
});
