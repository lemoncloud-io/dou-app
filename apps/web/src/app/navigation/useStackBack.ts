import { useCallback } from 'react';

import { useNavigateWithTransition } from '@chatic/shared';

import { canGoBackInApp, noteRewindStarted } from './stackDepth';

export type BackOutcome = 'overlay-closed' | 'navigated' | 'not-consumed';

export interface BackInput {
    hasBlockingOverlay: boolean;
    closeTopOverlay: () => boolean;
}

export const backIsTheAppsToSpend = (hasBlockingOverlay: boolean): boolean => hasBlockingOverlay || canGoBackInApp();

export const useStackBack = (): ((input: BackInput) => BackOutcome) => {
    const navigate = useNavigateWithTransition();

    return useCallback(
        ({ hasBlockingOverlay, closeTopOverlay }: BackInput): BackOutcome => {
            if (hasBlockingOverlay) {
                closeTopOverlay();
                return 'overlay-closed';
            }

            if (canGoBackInApp()) {
                noteRewindStarted();
                void navigate(-1);
                return 'navigated';
            }

            return 'not-consumed';
        },
        [navigate]
    );
};
