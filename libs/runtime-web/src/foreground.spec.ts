import { webForegroundPorts } from './foreground';

import type { VisibilitySource } from './foreground';

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

describe('webForegroundPorts — a document handed in', () => {
    const fakeDocument = (state: DocumentVisibilityState) => {
        const target = new EventTarget();
        return Object.assign(target, { visibilityState: state }) as unknown as VisibilitySource & {
            visibilityState: DocumentVisibilityState;
        };
    };

    it('reads the visibility of the document it is handed, not the page', () => {
        const source = fakeDocument('hidden');
        const ports = webForegroundPorts(source);

        expect(ports.read()).toBe(false);
        source.visibilityState = 'visible';
        expect(ports.read()).toBe(true);
    });

    it("listens on that document's visibility changes, until unsubscribed", () => {
        const source = fakeDocument('visible');
        const listener = jest.fn();
        const unsubscribe = webForegroundPorts(source).subscribe(listener);

        (source as unknown as EventTarget).dispatchEvent(new Event('visibilitychange'));
        document.dispatchEvent(new Event('visibilitychange'));
        expect(listener).toHaveBeenCalledTimes(1);

        unsubscribe();
        (source as unknown as EventTarget).dispatchEvent(new Event('visibilitychange'));
        expect(listener).toHaveBeenCalledTimes(1);
    });
});
