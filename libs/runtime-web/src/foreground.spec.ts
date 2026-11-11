import { webForegroundPorts } from './foreground';

const setVisibility = (state: DocumentVisibilityState): void => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
};

describe('webForegroundPorts', () => {
    afterEach(() => setVisibility('visible'));

    it("reads the page's visibility", () => {
        setVisibility('visible');
        expect(webForegroundPorts().read()).toBe(true);

        setVisibility('hidden');
        expect(webForegroundPorts().read()).toBe(false);
    });

    it('calls the listener on every visibility change, until unsubscribed', () => {
        const listener = jest.fn();
        const unsubscribe = webForegroundPorts().subscribe(listener);

        document.dispatchEvent(new Event('visibilitychange'));
        expect(listener).toHaveBeenCalledTimes(1);

        unsubscribe();
        document.dispatchEvent(new Event('visibilitychange'));
        expect(listener).toHaveBeenCalledTimes(1);
    });
});
