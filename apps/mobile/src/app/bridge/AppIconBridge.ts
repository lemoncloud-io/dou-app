import { NativeModules, Platform } from 'react-native';

const { AppIconManager } = NativeModules;

export const AppIconBridge = {
    /**
     * 네이티브 브릿지를 통해 실제 앱 아이콘 변경 명령을 전달합니다.
     * @param targetName 적용할 새 아이콘 앨리어스 이름
     * @param activeIconName 현재 켜져 있는 아이콘 앨리어스 이름 (Android용)
     */
    changeIcon: async (targetName: string, activeIconName: string): Promise<void> => {
        if (Platform.OS === 'android') {
            // 바꿀 아이콘과 현재 아이콘이 같으면 아무 작업도 하지 않음
            if (targetName === activeIconName) return;

            await AppIconManager.changeIcon(targetName, activeIconName);
        } else {
            await AppIconManager.changeIcon(targetName);
        }
    },
};
