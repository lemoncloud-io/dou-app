import { NativeModules, Platform } from 'react-native';

const { SystemBars } = NativeModules;

export const SystemBarsBridge = {
    setAppearance: async (isDark: boolean): Promise<void> => {
        if (Platform.OS !== 'android') return;

        if (!SystemBars) {
            console.warn('SystemBars native module is not registered.');
            return;
        }

        try {
            await SystemBars.setAppearance(isDark);
        } catch (error) {
            console.warn('Failed to update Android system bars.', error);
        }
    },
};
