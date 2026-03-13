import { useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { postMessage, getMobileAppInfo, useHandleAppMessage } from '@chatic/app-messages';

/**
 * Hook to handle back button in hybrid app environment.
 * - Syncs navigation state with native app
 * - Handles native back button events
 * - Can register modal/sheet close callbacks
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
     */
    const handleNativeBack = useCallback(() => {
        // Radix UI dialogs use data-state="open" when visible
        const openDialog = document.querySelector('[data-state="open"][role="dialog"]');
        if (openDialog) {
            // Trigger Escape key to close dialog (Radix handles this natively)
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            return;
        }

        navigate(-1);
    }, [navigate]);

    // Listen for native back button message
    useHandleAppMessage('OnBackPressed', () => {
        handleNativeBack();
    });

    return { handleNativeBack };
};
