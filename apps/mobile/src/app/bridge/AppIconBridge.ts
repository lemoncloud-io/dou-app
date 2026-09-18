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
    /**
     * Passes the actual app icon change command through the native bridge.
     * @param targetName the new icon alias name to apply
     * @param activeIconName the currently active icon alias name (for Android)
     */
    changeIcon: async (targetName: string, activeIconName: string): Promise<void> => {
        if (!AppIconManager) {
            console.warn('AppIconManager native module is not registered.');
            return;
        }

        if (Platform.OS === 'android') {
            // Do nothing if the target icon is the same as the currently active icon
            if (targetName === activeIconName) return;

            await AppIconManager.changeIcon(targetName, activeIconName);
        } else {
            await AppIconManager.changeIcon(targetName);
        }
    },
};
