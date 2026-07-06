import { NativeModules, Platform } from 'react-native';

const { BadgeSync } = NativeModules;

export interface IBadgeSyncBridge {
    setBase(count: number): Promise<void>;
}

export const BadgeSyncBridge: IBadgeSyncBridge = {
    /**
     * Persists the web's authoritative badge total into native storage so a later background push
     * can increment from the true value instead of from zero.
     *
     * Android only: on iOS the base is captured natively in AppDelegate from the live icon badge
     * (which the app process can read but a Notification Service Extension cannot), so there is
     * nothing for JS to push there and this call is a no-op.
     */
    setBase: async (count: number): Promise<void> => {
        if (Platform.OS !== 'android') return;

        if (!BadgeSync) {
            console.warn('BadgeSync native module is not registered.');
            return;
        }

        await BadgeSync.setBase(count);
    },
};
