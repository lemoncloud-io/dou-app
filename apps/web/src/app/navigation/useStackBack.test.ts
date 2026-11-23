import { renderHook } from '@testing-library/react';

import { backIsTheAppsToSpend, useStackBack } from './useStackBack';

jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));

const navigate = jest.fn((_to: number) => Promise.resolve());

const standingAt = (depth: number | null) => window.history.pushState(depth === null ? {} : { idx: depth }, '');

const back = (hasBlockingOverlay: boolean, closeTopOverlay = jest.fn(() => true)) => ({
    outcome: renderHook(() => useStackBack()).result.current({ hasBlockingOverlay, closeTopOverlay }),
    closeTopOverlay,
});

describe('useStackBack', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        for (let i = 0; i < 3; i++) window.dispatchEvent(new PopStateEvent('popstate'));
        standingAt(0);
    });

    describe('an overlay is open', () => {
        it('closes it and does not rewind, even with an entry behind', () => {
            standingAt(3);

            const { outcome, closeTopOverlay } = back(true);

            expect(outcome).toBe('overlay-closed');
            expect(closeTopOverlay).toHaveBeenCalled();
            expect(navigate).not.toHaveBeenCalled();
        });

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

        it('does not rewind twice from one entry above the first screen', () => {
            standingAt(1);

            expect(back(false).outcome).toBe('navigated');
            expect(back(false).outcome).toBe('not-consumed');
            expect(navigate).toHaveBeenCalledTimes(1);
        });

        it('reports not-consumed on the first screen', () => {
            standingAt(0);

            const { outcome, closeTopOverlay } = back(false);

            expect(outcome).toBe('not-consumed');
            expect(navigate).not.toHaveBeenCalled();
            expect(closeTopOverlay).not.toHaveBeenCalled();
        });

        it('reports not-consumed when the depth cannot be read', () => {
            standingAt(null);

            expect(back(false).outcome).toBe('not-consumed');
            expect(navigate).not.toHaveBeenCalled();
        });
    });

    it('returns not-consumed exactly when the shell report says the press is not the app to spend', () => {
        for (const hasBlockingOverlay of [true, false]) {
            for (const depth of [null, 0, 1, 5]) {
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

        it('counts a rewind that has not landed yet', () => {
            standingAt(1);
            back(false);

            expect(backIsTheAppsToSpend(false)).toBe(false);
        });
    });
});
