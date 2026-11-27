import { webSessionStore } from '.';

describe('webSessionStore', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it("reads and writes this tab's sessionStorage, and never localStorage", () => {
        const store = webSessionStore();
        store.set('k', 'v');
        expect(sessionStorage.getItem('k')).toBe('v');
        expect(localStorage.getItem('k')).toBeNull();
        sessionStorage.setItem('outside', '1');
        expect(store.keys()).toEqual(['k', 'outside']);
    });
});
