import { Logger } from './index';
import type { MMKV } from 'react-native-mmkv';
import { createMMKV } from 'react-native-mmkv';

const mmkv: MMKV = createMMKV();

export const StorageService = {
    /**
     * 데이터 저장
     */
    async set<T>(key: string, value: T): Promise<void> {
        try {
            const jsonValue = JSON.stringify(value);
            mmkv.set(key, jsonValue);
        } catch (e) {
            Logger.error('STORAGE', `Set error. : ${key}`, e);
        }
    },

    /**
     * 데이터를 불러오기
     */
    async get<T>(key: string): Promise<T | null> {
        try {
            const jsonValue = mmkv.getString(key);
            return jsonValue != null ? JSON.parse(jsonValue) : null;
        } catch (e) {
            Logger.error('STORAGE', 'JSON Parsing Error', e);
            return null;
        }
    },

    /**
     * 특정 키의 데이터 삭제
     */
    async remove(key: string): Promise<void> {
        try {
            mmkv.remove(key);
        } catch (e) {
            Logger.error('STORAGE', `Remove error. : ${key}`, e);
        }
    },

    /**
     * 모든 데이터 삭제
     */
    async clearAll(): Promise<void> {
        try {
            mmkv.clearAll();
        } catch (e) {
            Logger.error('STORAGE', `Clear all error.`, e);
        }
    },

    /**
     * 저장된 모든 키 목록 가져오기
     */
    getAllKeys(): string[] {
        try {
            return mmkv.getAllKeys();
        } catch (e) {
            Logger.error('STORAGE', 'Get all keys error.', e);
            return [];
        }
    },
};
