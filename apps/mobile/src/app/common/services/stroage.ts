import AsyncStorage from '@react-native-async-storage/async-storage';

export const STORAGE_KEYS = {
    USER: {
        DEVICE_ID: '@chatic/user/deviceId',
    },
} as const;

type StorageKey = (typeof STORAGE_KEYS.USER)[keyof typeof STORAGE_KEYS.USER];

export const storage = {
    async set(key: StorageKey, value: any): Promise<void> {
        const jsonValue = JSON.stringify(value);
        await AsyncStorage.setItem(key, jsonValue);
    },

    async get<T>(key: StorageKey): Promise<T | null> {
        try {
            const jsonValue: string | null = await AsyncStorage.getItem(key);
            return jsonValue != null ? JSON.parse(jsonValue) : null;
        } catch {
            return null;
        }
    },

    async remove(key: StorageKey): Promise<void> {
        await AsyncStorage.removeItem(key);
    },
};
