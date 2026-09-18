import { canGoBackInApp, readHistoryIndex } from './stackDepth';

describe('readHistoryIndex', () => {
    it('reads the idx the router planted', () => {
        window.history.pushState({ usr: null, key: 'abc', idx: 2 }, '');

        expect(readHistoryIndex()).toBe(2);
    });

    // A pushState that bypassed the router. The caller needs to know the stack is unrecoverable here.
    it('gives null when there is no idx', () => {
        window.history.pushState({ someoneElse: true }, '');

        expect(readHistoryIndex()).toBeNull();
    });

    it('does not throw when there is no history state at all', () => {
        window.history.pushState(null, '');

        expect(readHistoryIndex()).toBeNull();
    });
});

describe('canGoBackInApp', () => {
    // Not mockRestore() at the end of the case that spies: an assertion that throws before it would
    // leave the getter mocked for every case after, turning one failure into a misleading cascade.
    afterEach(() => jest.restoreAllMocks());

    it('is false on the app first screen', () => {
        window.history.pushState({ idx: 0 }, '');

        expect(canGoBackInApp()).toBe(false);
    });

    it('is true once the app has pushed an entry', () => {
        window.history.pushState({ idx: 1 }, '');

        expect(canGoBackInApp()).toBe(true);
    });

    // Not knowing where we are is not a reason to rewind — it is the strongest reason not to.
    it('is false when the index cannot be read', () => {
        window.history.pushState(null, '');

        expect(canGoBackInApp()).toBe(false);
    });

    // The regression anchor for why this function exists. `history.length` counts everything the
    // WebView ever visited, so on a long-lived WebView it says "yes" on the app's first screen —
    // which is exactly the wrong answer, and the one the old `history.length > 1` checks gave.
    it('ignores history.length, which keeps growing for the life of the WebView', () => {
        jest.spyOn(window.history, 'length', 'get').mockReturnValue(9);
        window.history.pushState({ idx: 0 }, '');

        expect(canGoBackInApp()).toBe(false);
    });
});
