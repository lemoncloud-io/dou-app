import type { PreferenceKey } from '@chatic/app-messages';

export interface IPreferenceService {
    /**
     * 설정값 조회
     */
    get<T = any>(key: PreferenceKey): Promise<T | null>;

    /**
     * 설정값 저장
     */
    set<T = any>(key: PreferenceKey, value: T): Promise<void>;

    /**
     * 설정값 삭제
     */
    remove(key: PreferenceKey): Promise<void>;

    /**
     * 모든 설정값 초기화
     */
    clearAll(): void;
}
