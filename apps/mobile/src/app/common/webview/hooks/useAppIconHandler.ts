import { useCallback } from 'react';

import { DEFAULT_APP_ICON_NAME, dynamicAppIconService } from '../../services';

import type { WebViewBridge } from './useBaseBridge';
import type {
    ChangeAppIcon,
    FetchAppIcon,
    OnChangeAppIconPayload,
    OnFetchAppIconPayload,
    OnFetchAppIconListPayload,
    WebDefaultMessage,
} from '@chatic/app-messages';

const toErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return String(error);
};

export const useAppIconHandler = (bridge: WebViewBridge) => {
    //  현재 적용된 아이콘 이름만 조회
    const handleFetchAppIcon = useCallback(
        async (message: FetchAppIcon) => {
            try {
                const currentIcon = await dynamicAppIconService.fetchCurrentIcon();
                bridge.post({
                    type: 'OnFetchAppIcon',
                    nonce: message.nonce,
                    data: { iconName: currentIcon, supported: true } as OnFetchAppIconPayload,
                });
            } catch (error) {
                bridge.post({
                    type: 'OnFetchAppIcon',
                    nonce: message.nonce,
                    data: { iconName: DEFAULT_APP_ICON_NAME, supported: false, error: toErrorMessage(error) },
                });
            }
        },
        [bridge]
    );

    //  사용 가능한 아이콘 목록 전체 조회
    const handleFetchAppIconList = useCallback(
        async (message: WebDefaultMessage<'FetchAppIconList'>) => {
            const availableIcons = dynamicAppIconService.getAvailableIcons();
            bridge.post({
                type: 'OnFetchAppIconList',
                nonce: message.nonce,
                data: { availableIcons } as OnFetchAppIconListPayload,
            });
        },
        [bridge]
    );

    //  앱 아이콘 변경 실행
    const handleChangeAppIcon = useCallback(
        async (message: ChangeAppIcon) => {
            try {
                const requestedIcon = message.data.iconName ?? null;
                const success = await dynamicAppIconService.setAppIcon(requestedIcon);
                const currentIcon = await dynamicAppIconService.fetchCurrentIcon();

                bridge.post({
                    type: 'OnChangeAppIcon',
                    nonce: message.nonce,
                    data: {
                        success,
                        requestedIconName: requestedIcon,
                        iconName: currentIcon,
                        supported: true,
                    } as OnChangeAppIconPayload,
                });
            } catch (error) {
                bridge.post({
                    type: 'OnChangeAppIcon',
                    nonce: message.nonce,
                    data: { success: false, error: toErrorMessage(error) },
                });
            }
        },
        [bridge]
    );

    return {
        handleFetchAppIcon,
        handleFetchAppIconList,
        handleChangeAppIcon,
    };
};
