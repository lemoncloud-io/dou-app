import { useCallback } from 'react';

import { DEFAULT_APP_ICON_NAME, provider } from '../../services';
import type { WebMessageAppHandler } from '@chatic/app-messages';
import { toErrorMessage } from '../../utils';

export const useAppIconHandler = () => {
    // 현재 적용된 아이콘 이름만 조회
    const handleFetchAppIcon = useCallback<WebMessageAppHandler<'FetchAppIcon'>>(async _message => {
        try {
            const currentIcon = await provider.dynamicAppIconService.fetchCurrentIcon();
            return {
                type: 'OnFetchAppIcon' as const,
                success: true,
                data: { iconName: currentIcon, supported: true },
            };
        } catch (error) {
            return {
                type: 'OnFetchAppIcon' as const,
                success: true,
                data: { iconName: DEFAULT_APP_ICON_NAME, supported: false, error: toErrorMessage(error) },
            };
        }
    }, []);

    // 사용 가능한 아이콘 목록 전체 조회
    const handleFetchAppIconList = useCallback<WebMessageAppHandler<'FetchAppIconList'>>(async _message => {
        const availableIcons = provider.dynamicAppIconService.getAvailableIcons();
        return {
            type: 'OnFetchAppIconList' as const,
            success: true,
            data: { availableIcons },
        };
    }, []);

    // 앱 아이콘 변경 실행
    const handleChangeAppIcon = useCallback<WebMessageAppHandler<'ChangeAppIcon'>>(async message => {
        // 새 규격에 따라 요청 데이터는 data가 아닌 payload 안에 존재합니다.
        const { iconName } = message.data;

        try {
            const requestedIcon = iconName ?? null;
            const success = await provider.dynamicAppIconService.setAppIcon(requestedIcon);
            const currentIcon = await provider.dynamicAppIconService.fetchCurrentIcon();

            return {
                type: 'OnChangeAppIcon' as const,
                success: true,
                data: {
                    success,
                    requestedIconName: requestedIcon,
                    iconName: currentIcon,
                    supported: true,
                },
            };
        } catch (error) {
            return {
                type: 'OnChangeAppIcon' as const,
                success: true,
                data: { success: false, error: toErrorMessage(error) },
            };
        }
    }, []);

    return {
        handleFetchAppIcon,
        handleFetchAppIconList,
        handleChangeAppIcon,
    };
};
