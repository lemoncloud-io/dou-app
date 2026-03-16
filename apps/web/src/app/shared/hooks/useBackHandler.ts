import { useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { postMessage, getMobileAppInfo, useHandleAppMessage } from '@chatic/app-messages';

import { useNavigateWithTransition } from '@chatic/page-transition';

/**
 * Hook to handle back button in hybrid app environment.
 * - Syncs navigation state with native app
 * - Syncs language setting with native app
 * - Handles native back button events
 * - Supports `data-prevent-back-close` attribute to prevent back button from closing dialogs
 */
export const useBackHandler = () => {
    const location = useLocation();
    const navigate = useNavigateWithTransition();
    const { i18n } = useTranslation();
    const { isOnMobileApp } = getMobileAppInfo();

    // Sync language with native app
    useEffect(() => {
        if (!isOnMobileApp) return;

        postMessage({
            type: 'SetLanguage',
            data: { language: i18n.language },
        });
    }, [i18n.language, isOnMobileApp]);

    // Notify native app about navigation state changes
    // Also watch for dialog state changes using MutationObserver
    useEffect(() => {
        if (!isOnMobileApp) return;

        const checkCanGoBack = () => {
            // Check for open dialogs first
            const hasOpenDialogs = document.querySelector(
                '[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"], [data-state="open"][role="menu"], [data-state="open"][role="listbox"]'
            );

            // Can go back if: there's history OR there are open dialogs to close
            const canGoBack = hasOpenDialogs !== null || (location.key !== 'default' && window.history.length > 1);

            postMessage({
                type: 'SetCanGoBack',
                data: { canGoBack },
            });
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
     * Handle back request from native app.
     *
     * Dialog detection relies on Radix UI's data-state="open" attribute.
     * Ensure all dialogs/modals use Radix primitives for consistent behavior.
     *
     * To prevent back button from closing a dialog, add `data-prevent-back-close` attribute:
     * <DialogContent data-prevent-back-close>
     */
    const handleNativeBack = useCallback(() => {
        // Radix UI components use data-state="open" when visible
        // Include all overlay-type components:
        // - role="dialog": Dialog, Sheet, Popover
        // - role="alertdialog": AlertDialog
        // - role="menu": DropdownMenu
        // - role="listbox": Select
        const openDialogs = document.querySelectorAll(
            '[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"], [data-state="open"][role="menu"], [data-state="open"][role="listbox"]'
        );

        if (openDialogs.length > 0) {
            // Get the topmost dialog (last in DOM order, highest z-index)
            const topmostDialog = openDialogs[openDialogs.length - 1];

            // Check if this dialog prevents back close
            if (topmostDialog.hasAttribute('data-prevent-back-close')) {
                // Dialog wants to prevent back close, do nothing
                return;
            }

            // AlertDialog does NOT close on Escape by design (requires explicit user action)
            // So we need to click a button inside the dialog to close it
            if (topmostDialog.getAttribute('role') === 'alertdialog') {
                // Find and click the first button (usually OK/Cancel)
                const button = topmostDialog.querySelector('button');
                if (button instanceof HTMLElement) {
                    button.click();
                }
                return;
            }

            // For regular dialogs, dispatch Escape key on document (Radix listens on document level)
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            return;
        }

        // Only navigate back if there's history to go back to
        const canGoBack = location.key !== 'default' && window.history.length > 1;
        if (canGoBack) {
            navigate(-1);
        }
    }, [navigate, location.key]);

    // Listen for native back button message
    useHandleAppMessage('OnBackPressed', handleNativeBack);

    return { handleNativeBack };
};
