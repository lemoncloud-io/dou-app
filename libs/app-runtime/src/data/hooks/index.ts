// 런타임에 남은 REST 훅 표면. 화면이 소비하던 훅들(clouds·subscription·users·profile)은
// 앱 레이어로 내려갔다 — react-query가 그 읽기들의 캐시 전부였고, 캐시 정책은 그리는 앱의 것이다
// (ADR-0070 결정 5, ②안 방향). 여기 남은 것은 런타임 자신이 부르는 것과, 런타임이 무효화하는 키다.
export * from './queryKeys';
export * from './device';
