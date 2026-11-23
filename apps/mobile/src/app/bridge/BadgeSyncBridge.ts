import { NativeModules, Platform } from 'react-native';

const { BadgeSync } = NativeModules;

export interface IBadgeSyncBridge {
    setBase(count: number): Promise<void>;
    getBase(): Promise<number | null>;
}

export const BadgeSyncBridge: IBadgeSyncBridge = {
    setBase: async (count: number): Promise<void> => {
        if (Platform.OS !== 'android') return;

        if (!BadgeSync) {
            console.warn('BadgeSync native module is not registered.');
            return;
        }

        await BadgeSync.setBase(count);
    },

    getBase: async (): Promise<number | null> => {
        if (Platform.OS !== 'android' || !BadgeSync?.getBase) return null;

        try {
            const base = await BadgeSync.getBase();
            return typeof base === 'number' ? base : null;
        } catch {
            return null;
        }
    },
};
