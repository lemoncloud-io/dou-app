import { shouldDismissTransientUi, type ObservedTransition } from './stackObserver';

const on = (pathname: string, action: ObservedTransition['action']): ObservedTransition => ({ pathname, action });

describe('shouldDismissTransientUi', () => {
    it('dismisses on POP', () => {
        expect(shouldDismissTransientUi(on('/channels/c1/room', 'PUSH'), on('/', 'POP'))).toBe(true);
    });

    it('dismisses on a PUSH to a different screen', () => {
        expect(shouldDismissTransientUi(on('/', 'POP'), on('/mypage', 'PUSH'))).toBe(true);
    });

    it('dismisses on a REPLACE that lands somewhere else', () => {
        expect(shouldDismissTransientUi(on('/invite/accept', 'REPLACE'), on('/', 'REPLACE'))).toBe(true);
    });

    it('does not dismiss on a REPLACE onto the same screen', () => {
        expect(shouldDismissTransientUi(on('/search', 'PUSH'), on('/search', 'REPLACE'))).toBe(false);
    });

    it('does not dismiss on the first record', () => {
        expect(shouldDismissTransientUi(null, on('/', 'POP'))).toBe(false);
        expect(shouldDismissTransientUi(null, on('/channels/c1/room', 'PUSH'))).toBe(false);
    });

    it('does not dismiss on a PUSH onto the same screen', () => {
        expect(shouldDismissTransientUi(on('/', 'PUSH'), on('/', 'PUSH'))).toBe(false);
    });
});
