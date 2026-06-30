/**
 * `store/store.ts`
 * - socket sync ↔ UI 사이의 단일 경계(seam). 프론트가 캐시 DB를 주입하는 지점.
 * - UI 읽기는 동기 in-memory mirror가 정본. 캐시 DB는 비동기 write-through sink(선택).
 * - 도메인별 스냅샷 스키마는 서로 다르므로 단일 스키마를 강제하지 않고 T로 받는다.
 */

/** UI가 동기로 읽는 store 경계. useSyncExternalStore 연결을 위해 version()을 노출한다. */
export interface Store<T> {
    upsert(key: string, value: T): void;
    read(key: string): T | undefined;
    readAll(): ReadonlyMap<string, T>;
    /** 변경 통지(키 무관). 반환값으로 구독 해제 */
    subscribe(listener: () => void): () => void;
    /** useSyncExternalStore getSnapshot 식별용 — 변경 시 증가 */
    version(): number;
    remove(key: string): void;
    clear(): void;
}

/** 프론트 캐시 DB 주입점: 비동기 sink. mirror 갱신과 별개로 write-through. */
export interface StoreBacking<T> {
    write(key: string, value: T): Promise<void>;
    remove?(key: string): Promise<void>;
}

export const createMemoryStore = <T>(backing?: StoreBacking<T>): Store<T> => {
    const map = new Map<string, T>();
    const listeners = new Set<() => void>();
    let ver = 0;

    const bump = () => {
        ver += 1;
        listeners.forEach(fn => fn());
    };

    return {
        upsert(key, value) {
            map.set(key, value);
            bump();
            // 캐시 DB write-through — fire-and-forget(UI 읽기는 mirror가 정본이라 await 불요)
            backing?.write(key, value).catch(() => void 0);
        },
        read(key) {
            return map.get(key);
        },
        readAll() {
            return map;
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        version() {
            return ver;
        },
        remove(key) {
            if (!map.delete(key)) return;
            bump();
            backing?.remove?.(key).catch(() => void 0);
        },
        clear() {
            if (!map.size) return;
            map.clear();
            bump();
        },
    };
};
