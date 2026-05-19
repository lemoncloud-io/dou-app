import { useCallback } from 'react';

import { DEFAULT_APP_ICON_NAME, provider } from '../../services';

import type {
    ChangeAppIcon,
    FetchAppIcon,
    FetchAppIconList,
    OnChangeAppIconPayload,
    OnFetchAppIconListPayload,
    OnFetchAppIconPayload,
} from '@chatic/app-messages';
import { toErrorMessage } from '../../utils';

export const useAppIconHandler = () => {
    //  현재 적용된 아이콘 이름만 조회
    const handleFetchAppIcon = useCallback(async (_message: FetchAppIcon): Promise<OnFetchAppIconPayload> => {
        try {
            const currentIcon = await provider.dynamicAppIconService.fetchCurrentIcon();
            return { iconName: currentIcon, supported: true };
        } catch (error) {
            return { iconName: DEFAULT_APP_ICON_NAME, supported: false, error: toErrorMessage(error) };
        }
    }, []);

    //  사용 가능한 아이콘 목록 전체 조회
    const handleFetchAppIconList = useCallback(
        async (_message: FetchAppIconList): Promise<OnFetchAppIconListPayload> => {
            const availableIcons = provider.dynamicAppIconService.getAvailableIcons();
            return { availableIcons };
        },
        []
    );

    //  앱 아이콘 변경 실행
    const handleChangeAppIcon = useCallback(async (message: ChangeAppIcon): Promise<OnChangeAppIconPayload> => {
        const { iconName } = message.data;
        try {
            const requestedIcon = iconName ?? null;
            const success = await provider.dynamicAppIconService.setAppIcon(requestedIcon);
            const currentIcon = await provider.dynamicAppIconService.fetchCurrentIcon();

            return {
                success,
                requestedIconName: requestedIcon,
                iconName: currentIcon,
                supported: true,
            };
        } catch (error) {
            return { success: false, error: toErrorMessage(error) };
        }
    }, []);

    return {
        handleFetchAppIcon,
        handleFetchAppIconList,
        handleChangeAppIcon,
    };
};
