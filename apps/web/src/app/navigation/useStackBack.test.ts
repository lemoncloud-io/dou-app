import { renderHook } from '@testing-library/react';

import { backIsTheAppsToSpend, useStackBack } from './useStackBack';

jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));

const navigate = jest.fn((_to: number) => Promise.resolve());

/** Puts the app at a given depth, the way the router would have. */
const standingAt = (depth: number | null) => window.history.pushState(depth === null ? {} : { idx: depth }, '');

const back = (hasBlockingOverlay: boolean, closeTopOverlay = jest.fn(() => true)) => ({
    outcome: renderHook(() => useStackBack()).result.current({ hasBlockingOverlay, closeTopOverlay }),
    closeTopOverlay,
});

describe('useStackBack', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Lands any rewind an earlier case left in flight, so each case reads the depth it set.
        for (let i = 0; i < 3; i++) window.dispatchEvent(new PopStateEvent('popstate'));
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

        // The rewind plays a page transition, so the browser moves a frame or more after the press.
        // A second press before then must not take the app past its first screen.
        it('does not rewind twice from one entry above the first screen', () => {
            standingAt(1);

            expect(back(false).outcome).toBe('navigated');
            expect(back(false).outcome).toBe('not-consumed');
            expect(navigate).toHaveBeenCalledTimes(1);
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

    // The invariant this hook exists to hold: `not-consumed` is exactly the case where the shell report
    // (`backIsTheAppsToSpend`) says false. If these two ever drift, the shell exits while the app still
    // had something to do, or sends the app a press it then drops — back doing nothing at all.
    it('returns not-consumed exactly when the shell report says the press is not the app to spend', () => {
        for (const hasBlockingOverlay of [true, false]) {
            for (const depth of [null, 0, 1, 5]) {
                // Lands the rewind the previous round started, so the report reads only this depth.
                window.dispatchEvent(new PopStateEvent('popstate'));
                standingAt(depth);
                const canGoBack = backIsTheAppsToSpend(hasBlockingOverlay);
                const { outcome } = back(hasBlockingOverlay);

                expect({ hasBlockingOverlay, depth, notConsumed: outcome === 'not-consumed' }).toEqual({
                    hasBlockingOverlay,
                    depth,
                    notConsumed: !canGoBack,
                });
            }
        }
    });

    describe('backIsTheAppsToSpend', () => {
        it('is the app to spend while an overlay is open, even with nothing behind', () => {
            standingAt(0);

            expect(backIsTheAppsToSpend(true)).toBe(true);
        });

        it('is the app to spend with an entry behind', () => {
            standingAt(2);

            expect(backIsTheAppsToSpend(false)).toBe(true);
        });

        it('is the shell to spend on the first screen with nothing open', () => {
            standingAt(0);

            expect(backIsTheAppsToSpend(false)).toBe(false);
        });

        // A rewind already asked for counts: one entry in, the press after it is the shell's.
        it('counts a rewind that has not landed yet', () => {
            standingAt(1);
            back(false);

            expect(backIsTheAppsToSpend(false)).toBe(false);
        });
    });
});
