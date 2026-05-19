import { useCallback, useEffect, useRef } from 'react';
import { useIsFocused } from '@react-navigation/native';
import type { CloseModal, OpenModal } from '@chatic/app-messages';
import type { IAppBridgeHost } from '@chatic/bridges';

/**
 * Hook to handle native modals triggered by the WebView.
 * It manages opening/closing native modals and synchronizes the modal's closed state
 * back to the WebView when the native screen regains focus.
 *
 * @param bridge The WebView bridge instance to send messages back to the web.
 * @param navigation The React Navigation object used to navigate to the modal screen.
 * @returns Handlers to open and close the modal.
 */
export const useModalHandler = (bridge: IAppBridgeHost, navigation: any) => {
    const isFocused = useIsFocused();
    const isOpenModal = useRef(false);

    // Sync state to the WebView when the native modal is closed and focus returns to this screen
    useEffect(() => {
        if (isFocused && isOpenModal.current) {
            bridge.pushEvent('OnCloseModal', undefined);
            isOpenModal.current = false;
        }
    }, [isFocused, bridge]);

    /**
     * Opens a native modal screen with the provided configuration.
     */
    const handleOpenModal = useCallback(
        (message: OpenModal) => {
            isOpenModal.current = true;
            const { url, type = 'sheet', heightRatio, dragHandle } = message.data;
            navigation.navigate('Modal', { url, type, heightRatio, dragHandle });
        },
        [navigation]
    );

    /**
     * Closes the currently open native modal if possible.
     */
    const handleCloseModal = useCallback(
        (_message: CloseModal) => {
            if (navigation.canGoBack()) {
                navigation.goBack();
            }
        },
        [navigation]
    );

    return { handleOpenModal, handleCloseModal };
};
