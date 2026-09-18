import { useCallback } from 'react';

import { DEFAULT_APP_ICON_NAME, provider } from '../../services';
import type { WebMessageData } from '@chatic/app-messages';
import { toErrorMessage } from '../../utils';

export const useAppIconHandler = () => {
    // Fetches only the name of the currently applied icon
    const handleFetchAppIcon = useCallback(async (_message: WebMessageData<'FetchAppIcon'>) => {
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

    // Fetches the full list of available icons
    const handleFetchAppIconList = useCallback(async (_message: WebMessageData<'FetchAppIconList'>) => {
        const availableIcons = provider.dynamicAppIconService.getAvailableIcons();
        return {
            type: 'OnFetchAppIconList' as const,
            success: true,
            data: { availableIcons },
        };
    }, []);

    // Executes the app icon change
    const handleChangeAppIcon = useCallback(async (message: WebMessageData<'ChangeAppIcon'>) => {
        // The request data lives in `data` here, not `payload`.
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
