import type { PreferenceKey } from '@chatic/app-messages';
import { mmkv } from './core';

/**
 * 앱의 단순 설정 및 상태(Preferences)를 관리하는 저장소
 */
export const preferenceStore = {
    /**
     * 설정값 조회
     */
    get: async <T = any>(key: PreferenceKey): Promise<T | null> => {
        return mmkv.get<T>(key);
    },

    /**
     * 설정값 저장
     */
    set: async <T = any>(key: PreferenceKey, value: T): Promise<void> => {
        return mmkv.set(key, value);
    },

    /**1
     * 설정값 삭제
     */
    remove: async (key: PreferenceKey): Promise<void> => {
        return mmkv.remove(key);
    },

    /**
     * 모든 설정값 초기화
     */
    clearAll: (): void => {
        mmkv.getAllKeys().forEach(k => mmkv.remove(k));
    },
};
