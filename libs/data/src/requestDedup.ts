/**
 * 모듈 레벨 소켓 요청 중복 제거(deduplication)
 *
 * 같은 hook이 여러 컴포넌트에서 동시에 마운트될 때
 * 동일한 소켓 요청이 중복으로 나가는 것을 방지
 */

const lastEmitTime = new Map<string, number>();

const DEDUP_WINDOW_MS = 1000;

/**
 * 지정한 key로 최근 DEDUP_WINDOW_MS 이내에 이미 요청이 나갔는지 확인
 * @returns true이면 emit 가능, false이면 중복이므로 스킵
 */
export const shouldEmit = (key: string): boolean => {
    const now = Date.now();
    const last = lastEmitTime.get(key);
    if (last && now - last < DEDUP_WINDOW_MS) {
        return false;
    }
    lastEmitTime.set(key, now);
    return true;
};

/**
 * 지정한 key의 dedup 기록을 제거하여 다음 shouldEmit 호출이 무조건 통과하도록 함
 * 컴포넌트 리마운트 등으로 상태가 리셋된 후 즉시 재요청이 필요한 경우 사용
 */
export const clearEmit = (key: string): void => {
    lastEmitTime.delete(key);
};
