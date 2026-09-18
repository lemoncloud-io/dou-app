import { useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { isNative } from '@chatic/bridges';
import { appBridge, useOnBackPressed } from '../bridge';
import { useStackBack } from '../navigation/useStackBack';

/** Selector for Radix UI overlay components that can be closed with back button */
const OPEN_DIALOG_SELECTOR =
    '[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"], [data-state="open"][role="menu"], [data-state="open"][role="listbox"]';

/**
 * Hook to handle back button in hybrid app environment.
 * - Syncs navigation state with native app
 * - Handles native back button events
 * - Supports `data-prevent-back-close` attribute to prevent back button from closing dialogs
 */
export const useBackHandler = () => {
    const location = useLocation();
    const isOnMobileApp = isNative();
    const consumeBack = useStackBack();

    // Notify native app about navigation state changes
    // Also watch for dialog state changes using MutationObserver
    useEffect(() => {
        if (!isOnMobileApp) return;

        const checkCanGoBack = () => {
            // Only report dialog state - native app tracks navigation history separately
            const hasOpenDialogs = document.querySelector(OPEN_DIALOG_SELECTOR) !== null;

            appBridge.setCanGoBack(hasOpenDialogs);
        };

        // Initial check
        checkCanGoBack();

        // Watch for dialog state changes (both attribute changes and DOM additions/removals)
        const observer = new MutationObserver(() => {
            checkCanGoBack();
        });

        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ['data-state'],
            childList: true,
            subtree: true,
        });

        return () => observer.disconnect();
    }, [location, isOnMobileApp]);

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
    const handleNativeBack = useCallback(
        () =>
            consumeBack({
                hasBlockingOverlay: document.querySelector(OPEN_DIALOG_SELECTOR) !== null,
                closeTopOverlay,
            }),
        [consumeBack, closeTopOverlay]
    );

    // Listen for native back button message
    useOnBackPressed(handleNativeBack);

    return { handleNativeBack };
};
