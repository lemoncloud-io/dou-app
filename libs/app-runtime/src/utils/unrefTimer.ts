/**
 * Node에서만 존재하는 `unref`로 타이머가 프로세스 종료를 붙잡지 않게 한다(브라우저는 no-op).
 *
 * 도메인을 모르는 타이머 shim이라 `coalescer`·`throttle`과 같은 자리에 둔다 — `SyncManager`의
 * 유예 타이머가 첫 소비자였고, 그 클래스 파일 안에 있을 이유는 없었다. 실질적으로는 jest가
 * 프로세스를 붙잡고 안 끝나는 것을 막는 장치다.
 */
export const unrefTimer = (timer: ReturnType<typeof setTimeout>): void => {
    (timer as { unref?: () => void }).unref?.();
};
