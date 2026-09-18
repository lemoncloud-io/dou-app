import { renderHook } from '@testing-library/react';

import { useStackBack } from './useStackBack';

jest.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

const navigate = jest.fn();

/** Puts the app at a given depth, the way the router would have. */
const standingAt = (depth: number | null) => window.history.pushState(depth === null ? {} : { idx: depth }, '');

const back = (hasBlockingOverlay: boolean, closeTopOverlay = jest.fn(() => true)) => ({
    outcome: renderHook(() => useStackBack()).result.current({ hasBlockingOverlay, closeTopOverlay }),
    closeTopOverlay,
});

describe('useStackBack', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        standingAt(0);
    });

    describe('an overlay is open', () => {
        // Overlay first, stack second. An open dialog is what the reader is looking at, so the
        // press belongs to it even when there is somewhere to rewind to.
        it('closes it and does not rewind, even with an entry behind', () => {
            standingAt(3);

            const { outcome, closeTopOverlay } = back(true);

            expect(outcome).toBe('overlay-closed');
            expect(closeTopOverlay).toHaveBeenCalled();
            expect(navigate).not.toHaveBeenCalled();
        });

        // A dialog marked `data-prevent-back-close` refuses. The press is still spent on the
        // overlay — reporting it as unconsumed would tell the shell it may exit while a dialog is up.
        it('still counts as consumed when the overlay refuses to close', () => {
            standingAt(3);

            const { outcome } = back(
                true,
                jest.fn(() => false)
            );

            expect(outcome).toBe('overlay-closed');
            expect(navigate).not.toHaveBeenCalled();
        });
    });

    describe('no overlay', () => {
        it('rewinds when there is an entry behind', () => {
            standingAt(2);

            expect(back(false).outcome).toBe('navigated');
            expect(navigate).toHaveBeenCalledWith(-1);
        });

        // The branch that had no name. The app is on its first screen with nothing open, so there
        // is genuinely nothing for it to do — and the shell has to be told that, not left guessing.
        it('reports not-consumed on the first screen', () => {
            standingAt(0);

            const { outcome, closeTopOverlay } = back(false);

            expect(outcome).toBe('not-consumed');
            expect(navigate).not.toHaveBeenCalled();
            expect(closeTopOverlay).not.toHaveBeenCalled();
        });

        // An index the router did not write. Rewinding blind is worse than not rewinding.
        it('reports not-consumed when the depth cannot be read', () => {
            standingAt(null);

            expect(back(false).outcome).toBe('not-consumed');
            expect(navigate).not.toHaveBeenCalled();
        });
    });

    // The invariant this hook exists to hold: `not-consumed` is exactly the case where the shell
    // report would say `canGoBack: false`. If these two ever drift, the shell exits while the app
    // still had something to do, or refuses to exit when it did not.
    it('returns not-consumed exactly when the shell report would say canGoBack false', () => {
        const reportWouldSay = (hasBlockingOverlay: boolean, depth: number | null) => {
            standingAt(depth);
            return hasBlockingOverlay || (depth ?? 0) > 0;
        };

        for (const hasBlockingOverlay of [true, false]) {
            for (const depth of [null, 0, 1, 5]) {
                const canGoBack = reportWouldSay(hasBlockingOverlay, depth);
                standingAt(depth);
                const { outcome } = back(hasBlockingOverlay);

                expect({ hasBlockingOverlay, depth, notConsumed: outcome === 'not-consumed' }).toEqual({
                    hasBlockingOverlay,
                    depth,
                    notConsumed: !canGoBack,
                });
            }
        }
    });
});
