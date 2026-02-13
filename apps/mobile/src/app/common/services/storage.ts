import AsyncStorage from '@react-native-async-storage/async-storage';

import { Logger } from './log';

export const STORAGE_KEYS = {
    USER: {},
} as const;

type StorageKey = (typeof STORAGE_KEYS.USER)[keyof typeof STORAGE_KEYS.USER];

export const StorageService = {
    /**
     * 데이터 저장
     */
    async set(key: StorageKey, value: any): Promise<void> {
        try {
            const jsonValue = JSON.stringify(value);
            await AsyncStorage.setItem(key, jsonValue);
        } catch (e) {
            Logger.error('STORAGE', `Set error. : ${key}`, e);
        }
    },

    /**
     * 데이터를 불러오기
     */
    async get<T>(key: StorageKey): Promise<T | null> {
        try {
            const jsonValue = await AsyncStorage.getItem(key);
            return jsonValue != null ? JSON.parse(jsonValue) : null;
        } catch {
            return null;
        }
    },

    /**
     * 문자열 데이터 불러오기
     */
    async getString(key: StorageKey): Promise<string | null> {
        try {
            return await AsyncStorage.getItem(key);
        } catch {
            return null;
        }
    },

    /**
     * 특정 키의 데이터 삭제
     */
    async remove(key: StorageKey): Promise<void> {
        try {
            await AsyncStorage.removeItem(key);
        } catch (e) {
            Logger.error('STORAGE', `Remove error. : ${key}`, e);
        }
    },

    /**
     * 모든 데이터 삭제
     */
    async clearAll(): Promise<void> {
        try {
            await AsyncStorage.clear();
        } catch (e) {
            Logger.error('STORAGE', `Clear all error.`, e);
        }
    },
};
