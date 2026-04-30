import { logger } from './log';
import { AppIconBridge } from '../../bridge';
import { mmkv } from '../storages/preference/mmkv/core';

export const DEFAULT_APP_ICON_NAME = 'DefaultIcon';

const ICON_STORAGE_KEY = '@app_current_icon_name';

export interface AppIconOption {
    id: string | null;
    label: string;
}

export const AVAILABLE_ICONS: AppIconOption[] = [
    { id: null, label: 'Default' },
    { id: 'WhiteIcon', label: 'White' },
];

export const dynamicAppIconService = {
    /**
     * 사용 가능한 아이콘 목록 반환
     */
    getAvailableIcons: (): AppIconOption[] => {
        return AVAILABLE_ICONS;
    },

    /**
     * 현재 설정된 앱 아이콘 이름 조회
     */
    fetchCurrentIcon: async (): Promise<string> => {
        try {
            const storedIconName = await mmkv.get<string>(ICON_STORAGE_KEY);
            return storedIconName || DEFAULT_APP_ICON_NAME;
        } catch (error) {
            logger.error('APP_ICON', 'Failed to fetch current icon from MMKV', error);
            return DEFAULT_APP_ICON_NAME;
        }
    },

    /**
     * 앱 아이콘 변경 실행 및 상태 저장
     */
    setAppIcon: async (targetIconName?: string | null): Promise<boolean> => {
        try {
            const isDefault = !targetIconName || targetIconName === DEFAULT_APP_ICON_NAME;
            const targetName = isDefault ? 'DefaultIcon' : targetIconName;

            const currentIcon = await dynamicAppIconService.fetchCurrentIcon();

            if (targetName === currentIcon) {
                return true;
            }

            await AppIconBridge.changeIcon(targetName, currentIcon);
            await mmkv.set<string>(ICON_STORAGE_KEY, targetName);

            logger.info('APP_ICON', `Icon successfully changed to: ${targetName}`);
            return true;
        } catch (error) {
            logger.error('APP_ICON', `Failed to set app icon to ${targetIconName}`, error);
            return false;
        }
    },
};
