import { buildSubWebViewInsetScript } from './subWebViewInsetScript';

type Root = { style: { setProperty: jest.Mock } };

/** Runs the script against a stand-in `document`, as the WebView would; returns it to change later. */
const runWith = (root: Root | null, script: string, observers: Array<() => void> = []) => {
    const document: { documentElement: Root | null } = { documentElement: root };
    class MutationObserver {
        constructor(private readonly callback: (records: unknown[], observer: MutationObserver) => void) {}
        observe() {
            observers.push(() => this.callback([], this));
        }
        disconnect() {
            observers.length = 0;
        }
    }
    // eslint-disable-next-line no-new-func -- running the injected script is what is under test
    new Function('document', 'MutationObserver', script)(document, MutationObserver);
    return document;
};

describe('buildSubWebViewInsetScript', () => {
    it('sets one property per edge on the root element, in pixels', () => {
        const setProperty = jest.fn();

        runWith({ style: { setProperty } }, buildSubWebViewInsetScript({ top: 47, right: 0, bottom: 34, left: 12.5 }));

        expect(setProperty.mock.calls).toEqual([
            ['--chatic-safe-area-inset-top', '47px'],
            ['--chatic-safe-area-inset-right', '0px'],
            ['--chatic-safe-area-inset-bottom', '34px'],
            ['--chatic-safe-area-inset-left', '12.5px'],
        ]);
    });

    // Android can run the boot script before the document has a root element; the run at load end
    // comes after the page has painted.
    it('waits for the root element when the document has none yet, and sets the properties once', () => {
        const observers: Array<() => void> = [];
        const document = runWith(
            null,
            buildSubWebViewInsetScript({ top: 47, right: 0, bottom: 34, left: 0 }),
            observers
        );
        expect(observers).toHaveLength(1);

        observers[0]();
        expect(observers).toHaveLength(1);

        const setProperty = jest.fn();
        document.documentElement = { style: { setProperty } };
        observers[0]();

        expect(setProperty).toHaveBeenCalledWith('--chatic-safe-area-inset-top', '47px');
        expect(setProperty).toHaveBeenCalledTimes(4);
        expect(observers).toHaveLength(0);
    });

    it('writes 0 for an inset that is not a number a stylesheet can take', () => {
        const setProperty = jest.fn();

        runWith(
            { style: { setProperty } },
            buildSubWebViewInsetScript({ top: NaN, right: -3, bottom: Infinity, left: 0 })
        );

        expect(setProperty.mock.calls.map(([, value]) => value)).toEqual(['0px', '0px', '0px', '0px']);
    });
});
