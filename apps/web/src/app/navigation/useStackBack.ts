import { useCallback } from 'react';

import { useNavigateWithTransition } from '@chatic/shared';

import { canGoBackInApp, noteRewindStarted } from './stackDepth';

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
 * Whether a back press now would be the app's to spend — an overlay takes it, or there is an entry
 * behind this one to rewind to.
 *
 * This is what the page reports to a frame with a back button (`appShell.backGesture`), and it is
 * exactly the negation of `useStackBack`'s `not-consumed`: the two come from this one expression so
 * that the frame never sends a press the page then drops, and never keeps one the page would have
 * spent. They were once computed apart — the Android shell read the WebView's own history instead —
 * and that drift is what left back doing nothing on the app's first screen after a sign-in by code.
 */
export const backIsTheAppsToSpend = (hasBlockingOverlay: boolean): boolean => hasBlockingOverlay || canGoBackInApp();

/**
 * Decides what a back request does, and reports which branch it took.
 *
 * The order is unchanged from what `useBackHandler` has always done: an open overlay wins, then a
 * rewindable entry, then nothing. What changes is that the third branch now has a name a caller
 * can act on.
 *
 * **`not-consumed` is exactly `!backIsTheAppsToSpend(hasBlockingOverlay)`**, the negation of what
 * the page reports to the shell.
 *
 * Note an overlay that refuses the press still returns `overlay-closed`. The name describes the
 * branch, not the outcome of the close: what matters to every caller is that the overlay layer
 * consumed the press, so the app is emphatically not done with back while a dialog is up.
 *
 * The rewind plays the back page transition, the same one the header's back arrow plays. The press
 * this answers is Android's back button or gesture, which used to switch screens with no motion while
 * the arrow on the same screen slid. iOS never gets here: its back is the WebView's own swipe, which
 * animates natively and reaches the page only as a `popstate` afterwards. The outcome is reported
 * at once; the transition finishes on its own, and until the rewind has landed `canGoBackInApp`
 * already counts it, so a second press in that window judges from where the first one is going.
 */
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
