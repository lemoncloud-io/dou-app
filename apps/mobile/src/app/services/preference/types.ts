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
     * 설정값 동기 조회 — 첫 페인트 전에 필요한 값(테마)만 사용한다.
     * 비동기 복원은 첫 프레임 뒤에 도착해 화면 번쩍임으로 노출된다.
     */
    getSync<T = any>(key: PreferenceKey): T | null;

    /**
     * 설정값 동기 저장 (`getSync`와 쌍)
     */
    setSync<T = any>(key: PreferenceKey, value: T): void;

    /**
     * 설정값 삭제
     */
    remove(key: PreferenceKey): Promise<void>;

    /**
     * 모든 설정값 초기화
     */
    clearAll(): void;
}
