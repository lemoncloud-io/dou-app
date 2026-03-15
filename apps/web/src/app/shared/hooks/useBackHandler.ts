import { useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { postMessage, getMobileAppInfo, useHandleAppMessage } from '@chatic/app-messages';

/**
 * Hook to handle back button in hybrid app environment.
 * - Syncs navigation state with native app
 * - Handles native back button events
 * - Supports `data-prevent-back-close` attribute to prevent back button from closing dialogs
 */
export const useBackHandler = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { isOnMobileApp } = getMobileAppInfo();

    // Notify native app about navigation state changes
    useEffect(() => {
        if (!isOnMobileApp) return;

        // Check if we can go back (not on root path)
        const canGoBack = location.key !== 'default' && window.history.length > 1;

        postMessage({
            type: 'SetCanGoBack',
            data: { canGoBack },
        });
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
        // Radix UI dialogs use data-state="open" when visible
        const openDialogs = document.querySelectorAll('[data-state="open"][role="dialog"]');

        if (openDialogs.length > 0) {
            // Get the topmost dialog (last in DOM order, highest z-index)
            const topmostDialog = openDialogs[openDialogs.length - 1];

            // Check if this dialog prevents back close
            if (topmostDialog.hasAttribute('data-prevent-back-close')) {
                // Dialog wants to prevent back close, do nothing
                return;
            }

            // Trigger Escape key to close dialog (Radix handles this natively)
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            return;
        }

        navigate(-1);
    }, [navigate]);

    // Listen for native back button message
    useHandleAppMessage('OnBackPressed', handleNativeBack);

    return { handleNativeBack };
};
