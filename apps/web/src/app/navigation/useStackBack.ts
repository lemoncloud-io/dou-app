import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { canGoBackInApp } from './stackDepth';

/**
 * What the app did with a back request.
 *
 * The third value is the one that did not exist before. When nothing was open and nothing was
 * behind us, the old code simply returned, and the shell was left to guess whether that meant
 * "handled" or "there is nothing here, you may exit". Naming it is the whole point of this type.
 */
export type BackOutcome =
    /** The overlay layer took the press — it closed something, or deliberately refused to. */
    | 'overlay-closed'
    /** Rewound one entry. */
    | 'navigated'
    /** Nothing to do. The shell may treat this as "the app is done with back". */
    | 'not-consumed';

export interface BackInput {
    /**
     * Whether an overlay is open that should take the press.
     *
     * Passed in rather than detected here: finding one means knowing the UI library's open-state
     * attributes, and a module that decides history should not also know what Radix is.
     */
    hasBlockingOverlay: boolean;
    /**
     * Closes the topmost overlay. Returns false when it could not be closed — including when it
     * refused on purpose, which some dialogs do.
     */
    closeTopOverlay: () => boolean;
}

/**
 * Decides what a back request does, and reports which branch it took.
 *
 * The order is unchanged from what `useBackHandler` has always done: an open overlay wins, then a
 * rewindable entry, then nothing. What changes is that the third branch now has a name a caller
 * can act on.
 *
 * **`not-consumed` is exactly `!hasBlockingOverlay && !canGoBackInApp()`**, which is the negation
 * of what the shell report will compute. That is deliberate and is the reason both live in this
 * module: the two answers cannot drift apart if they come from one expression. Today they are
 * computed in two places and do drift.
 *
 * Note an overlay that refuses the press still returns `overlay-closed`. The name describes the
 * branch, not the outcome of the close: what matters to every caller is that the overlay layer
 * consumed the press, so the app is emphatically not done with back while a dialog is up.
 */
export const useStackBack = (): ((input: BackInput) => BackOutcome) => {
    const navigate = useNavigate();

    return useCallback(
        ({ hasBlockingOverlay, closeTopOverlay }: BackInput): BackOutcome => {
            if (hasBlockingOverlay) {
                closeTopOverlay();
                return 'overlay-closed';
            }

            if (canGoBackInApp()) {
                navigate(-1);
                return 'navigated';
            }

            return 'not-consumed';
        },
        [navigate]
    );
};
