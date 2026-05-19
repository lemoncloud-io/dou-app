import { useCallback, useEffect, useRef } from 'react';
import { useIsFocused } from '@react-navigation/native';
import type { CloseModal, OpenModal } from '@chatic/app-messages';
import type { IAppBridgeHost } from '@chatic/bridges';

export interface ModalHandler {
    openModal: (params: { url: string; type: 'sheet' | 'full'; heightRatio?: number; dragHandle?: boolean }) => void;
    closeModal: () => void;
    canGoBack: () => boolean;
}

/**
 * Hook to handle native modals triggered by the WebView.
 * It manages opening/closing native modals and synchronizes the modal's closed state
 * back to the WebView when the native screen regains focus.
 *
 * @param bridge The WebView bridge instance to send messages back to the web.
 * @param modalHandler An object with functions to control the native modal.
 * @returns Handlers to open and close the modal.
 */
export const useModalHandler = (bridge: IAppBridgeHost, modalHandler: ModalHandler) => {
    const isFocused = useIsFocused();
    const isOpenModal = useRef(false);

    // Sync state to the WebView when the native modal is closed and focus returns to this screen
    useEffect(() => {
        if (isFocused && isOpenModal.current) {
            // pushEvent 파라미터를 단일 메시지 객체로 변경
            bridge.pushEvent({
                type: 'OnCloseModal',
            } as any);

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
            modalHandler.openModal({ url, type, heightRatio, dragHandle });
        },
        [modalHandler]
    );

    /**
     * Closes the currently open native modal if possible.
     */
    const handleCloseModal = useCallback(
        (_message: CloseModal) => {
            if (modalHandler.canGoBack()) {
                modalHandler.closeModal();
            }
        },
        [modalHandler]
    );

    return { handleOpenModal, handleCloseModal };
};
