import { WebStore } from './webStore';

describe('WebStore', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it('writes through to the web storage it wraps', () => {
        const store = WebStore.local();
        store.set('k', 'v');
        expect(localStorage.getItem('k')).toBe('v');
        store.remove('k');
        expect(localStorage.getItem('k')).toBeNull();
    });

    it('answers with what the storage holds now, including writes made around it', () => {
        const store = WebStore.session();
        sessionStorage.setItem('k', 'outside');
        expect(store.get('k')).toBe('outside');
        expect(store.keys()).toEqual(['k']);
    });

    it('keeps local and session storage apart', () => {
        WebStore.session().set('k', 'session');
        expect(localStorage.getItem('k')).toBeNull();
        expect(WebStore.local().get('k')).toBeNull();
    });

    it('falls back to memory when there is no web storage', () => {
        const store = WebStore.over(undefined);
        store.set('k', 'v');
        expect(store.get('k')).toBe('v');
        expect(localStorage.getItem('k')).toBeNull();
    });
});
