import { useCallback, useEffect, useRef } from 'react';
import { useIsFocused } from '@react-navigation/native';
import type { WebMessageData } from '@chatic/app-messages';
import type { IAppBridgeHost } from '@chatic/bridges';

export interface ModalHandler {
    openModal: (params: { url: string; type: 'sheet' | 'full'; heightRatio?: number; dragHandle?: boolean }) => void;
    closeModal: () => void;
    canGoBack: () => boolean;
}

export const useModalHandler = (bridge: IAppBridgeHost, modalHandler: ModalHandler) => {
    const isFocused = useIsFocused();
    const isOpenModal = useRef(false);

    useEffect(() => {
        if (isFocused && isOpenModal.current) {
            // 이벤트 푸시에 명시적 타입 지정 및 success 주입
            bridge.pushEvent<'OnCloseModal'>({
                type: 'OnCloseModal',
                success: true,
            });

            isOpenModal.current = false;
        }
    }, [isFocused, bridge]);

    const handleOpenModal = useCallback(
        async (message: WebMessageData<'OpenModal'>) => {
            isOpenModal.current = true;
            const { url, type = 'sheet', heightRatio, dragHandle } = message.data;
            modalHandler.openModal({ url, type, heightRatio, dragHandle });

            return { type: 'OnOpenModal' as const, success: true };
        },
        [modalHandler]
    );

    const handleCloseModal = useCallback(
        async (_message: WebMessageData<'CloseModal'>) => {
            if (modalHandler.canGoBack()) {
                modalHandler.closeModal();
            }
            return { type: 'OnCloseModal' as const, success: true };
        },
        [modalHandler]
    );

    return { handleOpenModal, handleCloseModal };
};
