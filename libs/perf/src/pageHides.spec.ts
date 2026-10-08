import { isPageHidden, pageHideCount } from './pageHides';

const setVisibility = (state: 'visible' | 'hidden') => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    document.dispatchEvent(new Event('visibilitychange'));
};

describe('pageHideCount', () => {
    afterEach(() => setVisibility('visible'));

    it('counts each time the page becomes hidden, not each visibility change', () => {
        const before = pageHideCount();

        setVisibility('hidden');
        setVisibility('visible');
        setVisibility('hidden');
        setVisibility('visible');

        expect(pageHideCount() - before).toBe(2);
    });

    it('reports whether the page is hidden now', () => {
        setVisibility('hidden');
        expect(isPageHidden()).toBe(true);

        setVisibility('visible');
        expect(isPageHidden()).toBe(false);
    });
});
