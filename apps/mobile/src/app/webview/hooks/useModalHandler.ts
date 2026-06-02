import { useCallback, useEffect, useRef } from 'react';
import { useIsFocused } from '@react-navigation/native';
import type { WebMessageAppHandler } from '@chatic/app-messages';
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
                data: {},
            });

            isOpenModal.current = false;
        }
    }, [isFocused, bridge]);

    const handleOpenModal = useCallback<WebMessageAppHandler<'OpenModal'>>(
        async message => {
            isOpenModal.current = true;
            const { url, type = 'sheet', heightRatio, dragHandle } = message.data;
            modalHandler.openModal({ url, type, heightRatio, dragHandle });

            return { type: 'OnOpenModal', success: true, data: {} };
        },
        [modalHandler]
    );

    const handleCloseModal = useCallback<WebMessageAppHandler<'CloseModal'>>(
        async _message => {
            if (modalHandler.canGoBack()) {
                modalHandler.closeModal();
            }
            return { type: 'OnCloseModal' as const, success: true, data: {} };
        },
        [modalHandler]
    );

    return { handleOpenModal, handleCloseModal };
};
