import { useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { runtime } from '@chatic/runtime';
import { useOnBackPressed } from '../bridge';
import { backIsTheAppsToSpend, useStackBack } from '../navigation';

/** Selector for Radix UI overlay components that can be closed with back button */
const OPEN_DIALOG_SELECTOR =
    '[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"], [data-state="open"][role="menu"], [data-state="open"][role="listbox"]';

/**
 * Hook to handle back button in hybrid app environment.
 * - Tells the frame, where it has a back gesture (the host's `appShell` port), whether a back press
 *   is the page's to spend
 * - Handles native back button events
 * - Supports `data-prevent-back-close` attribute to prevent back button from closing dialogs
 */
export const useBackHandler = () => {
    const location = useLocation();
    const backGesture = runtime.appShell.backGesture;
    const consumeBack = useStackBack();

    // The whole answer, history included, not only whether a dialog is open. The Android shell used to
    // add the WebView's own `canGoBack` for the history half, which does not follow the router's
    // pushState entries: back offered to exit from pushed screens, and where it read true on the first
    // screen — after the `-2` rewind a sign-in by code ends with — the press came here and was dropped.
    const reportCanGoBack = useCallback(() => {
        if (!backGesture) return;
        backGesture.setCanGoBack(backIsTheAppsToSpend(document.querySelector(OPEN_DIALOG_SELECTOR) !== null));
    }, [backGesture]);

    // Report on every location change, and whenever a dialog opens or closes.
    useEffect(() => {
        if (!backGesture) return;

        reportCanGoBack();

        // Watch for dialog state changes (both attribute changes and DOM additions/removals)
        const observer = new MutationObserver(() => {
            reportCanGoBack();
        });

        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ['data-state'],
            childList: true,
            subtree: true,
        });

        return () => observer.disconnect();
    }, [location, backGesture, reportCanGoBack]);

    /**
     * Closes the topmost open overlay.
     *
     * Dialog detection relies on Radix UI's `data-state="open"` attribute, so every dialog and
     * modal has to be a Radix primitive for back to reach it. This stays here rather than moving
     * into the navigation module on purpose: which library draws an overlay, and how it is asked
     * to close, is this layer's business and not the history module's.
     *
     * To keep a dialog open against back, give it `data-prevent-back-close`:
     * `<DialogContent data-prevent-back-close>`. That returns false — the press is still spent on
     * the overlay, it just declines to act on it.
     */
    const closeTopOverlay = useCallback((): boolean => {
        const openDialogs = document.querySelectorAll(OPEN_DIALOG_SELECTOR);
        const topmostDialog = openDialogs[openDialogs.length - 1];
        if (!topmostDialog) return false;

        if (topmostDialog.hasAttribute('data-prevent-back-close')) return false;

        // AlertDialog does not close on Escape by design — it wants an explicit choice — so the
        // press is delivered to its first button instead.
        if (topmostDialog.getAttribute('role') === 'alertdialog') {
            const button = topmostDialog.querySelector('button');
            if (!(button instanceof HTMLElement)) return false;
            button.click();
            return true;
        }

        // Radix listens for Escape at the document level.
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return true;
    }, []);

    /**
     * Handles a back request from the native shell.
     *
     * The judgement belongs to `useStackBack`; this supplies the overlay half it deliberately does
     * not know about. The outcome is returned rather than dropped because the third case — nothing
     * open, nothing behind — is what the shell needs in order to decide about exiting, and it had
     * no name at all until now.
     */
    const handleNativeBack = useCallback(() => {
        const outcome = consumeBack({
            hasBlockingOverlay: document.querySelector(OPEN_DIALOG_SELECTOR) !== null,
            closeTopOverlay,
        });
        // A rewind lands a frame or more later, and the location effect reports only then. Reporting
        // now — `canGoBackInApp` already counts the rewind in flight — answers a quick second press
        // from where the first one is going: on the first screen the frame gets it, not the page.
        if (outcome === 'navigated') reportCanGoBack();
        return outcome;
    }, [consumeBack, closeTopOverlay, reportCanGoBack]);

    // Listen for native back button message
    useOnBackPressed(handleNativeBack);

    return { handleNativeBack };
};
