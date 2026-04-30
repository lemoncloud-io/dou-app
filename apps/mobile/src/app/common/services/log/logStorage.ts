import { mmkv } from '../../database';

/**
 * 로그 저장소 어댑터 인터페이스.
 */
export interface ILogStorage {
    /**
     * 키로 직렬화된 값을 불러온다.
     * 값이 없거나 역직렬화에 실패하면 `null`을 반환한다.
     */
    load<T>(key: string): Promise<T | null>;

    /**
     * 키로 값을 저장한다.
     * 직렬화와 에러 처리는 저장소 구현체가 담당한다.
     */
    save<T>(key: string, value: T): Promise<void>;
}

/**
 * 공용 MMKV 래퍼를 사용하는 기본 로그 저장소 어댑터.
 */
export const mmkvLogStorage: ILogStorage = {
    load: key => mmkv.get(key),
    save: (key, value) => mmkv.set(key, value),
};
