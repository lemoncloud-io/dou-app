import { shouldDismissTransientUi, type ObservedTransition } from './stackObserver';

const on = (pathname: string, action: ObservedTransition['action']): ObservedTransition => ({ pathname, action });

describe('shouldDismissTransientUi', () => {
    // The reported symptom, and the reason this rule exists: the banner sat there through a back
    // press because the toaster is mounted above the router and never hears about transitions.
    it('dismisses on POP', () => {
        expect(shouldDismissTransientUi(on('/channels/c1/room', 'PUSH'), on('/', 'POP'))).toBe(true);
    });

    it('dismisses on a PUSH to a different screen', () => {
        expect(shouldDismissTransientUi(on('/', 'POP'), on('/mypage', 'PUSH'))).toBe(true);
    });

    // A redirect chain ends in a REPLACE, and the screen it lands on is as new to the reader as a
    // pushed one.
    it('dismisses on a REPLACE that lands somewhere else', () => {
        expect(shouldDismissTransientUi(on('/invite/accept', 'REPLACE'), on('/', 'REPLACE'))).toBe(true);
    });

    // Query normalisation and filter writes. The screen did not change, and dismissing here would
    // eat a banner that arrived moments earlier.
    it('does not dismiss on a REPLACE onto the same screen', () => {
        expect(shouldDismissTransientUi(on('/search', 'PUSH'), on('/search', 'REPLACE'))).toBe(false);
    });

    // Nothing can have been raised yet, and the observer records the current location on subscribe.
    it('does not dismiss on the first record', () => {
        expect(shouldDismissTransientUi(null, on('/', 'POP'))).toBe(false);
        expect(shouldDismissTransientUi(null, on('/channels/c1/room', 'PUSH'))).toBe(false);
    });

    // Same reasoning as REPLACE: the pathname is all the observer is given (the tracker is
    // pathname-only on purpose, because query strings carry capability tokens).
    it('does not dismiss on a PUSH onto the same screen', () => {
        expect(shouldDismissTransientUi(on('/', 'PUSH'), on('/', 'PUSH'))).toBe(false);
    });
});
