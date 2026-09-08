/**
 * The sync module's value constants.
 *
 * `UNREGISTER_GRACE_MS` used to be exported from `SyncManager.ts` — a class file handing out a
 * constant so its test could advance timers past the grace window. The value is the same; what
 * changes is that the class file now holds only the class (see 문서 §파일 배치 규칙).
 */

/**
 * refs가 0이 된 타깃을 실제로 stop하기까지의 유예 (ADR-0058).
 *
 * 화면 전환은 이전 화면의 unregister와 다음 화면의 register를 몇 ms 간격으로 반복하는데, 즉시
 * stop하면 scheduler가 타깃과 **스냅샷을 함께 폐기**해 재등록마다 즉시 폴링 1회(`scheduleNow(0)`)
 * + 스냅샷 부재로 인한 "무조건 변경" 캐시 쓰기 1회가 났다 — 2026-08-14 폭주 감사에서 잡힌
 * `save:channel` 228 / `save:join` 632의 정체다. 유예 내 재등록은 `register`의 기존 merge 경로로
 * 살아 있는 타깃에 그대로 합류하므로 재시작도 재폴링도 없다.
 *
 * 30초: 방↔홈 왕복(보통 수 초)을 넉넉히 덮되, 떠난 채널의 폴링이 백그라운드에 오래 살아남지
 * 않는 값. 유예 중인 타깃의 폴링은 idle 백오프(최대 60초)를 이어가므로 잔여 비용은 채널당
 * 많아야 요청 한두 건이다.
 */
export const UNREGISTER_GRACE_MS = 30_000;
