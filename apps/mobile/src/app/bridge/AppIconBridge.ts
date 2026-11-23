import { NativeModules, Platform } from 'react-native';

const { AppIconManager } = NativeModules;

if (!AppIconManager) {
    console.warn(
        'AppIconManager native module is not registered. Please ensure native side is compiled and registered.'
    );
}

export interface IAppIconBridge {
    changeIcon(targetName: string, activeIconName: string): Promise<void>;
}

export const AppIconBridge: IAppIconBridge = {
    changeIcon: async (targetName: string, activeIconName: string): Promise<void> => {
        if (!AppIconManager) {
            console.warn('AppIconManager native module is not registered.');
            return;
        }

        if (Platform.OS === 'android') {
            if (targetName === activeIconName) return;

            await AppIconManager.changeIcon(targetName, activeIconName);
        } else {
            await AppIconManager.changeIcon(targetName);
        }
    },
};
