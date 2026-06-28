# debug

> 대상: `apps/web/src/app/features/debug`

## 책임

개발자 전용 도구 묶음이다. 인증 흐름 테스트, 캐시/DB 동작 점검, 업로드 모니터링, 로그 버퍼 조회, 배지 카운트 검증 등 진단·테스트 화면을 제공한다. 원래 mypage 안에 있었으나(약 4,300줄) 일반 설정 UX와 개발자 도구를 분리하기 위해 별도 feature로 떼어냈다.

## 화면

| 페이지                | 경로(`ROUTES.debug.*`) | 설명                                                          |
| --------------------- | ---------------------- | ------------------------------------------------------------- |
| `DebugPage`           | `/debug`               | 허브 — 도구 목록, 앱 버전, 디버그 해제 버튼                   |
| `DebugLoginPage`      | `/debug/login`         | 이메일 로그인 테스트(`useLogin`)                              |
| `DebugChatPage`       | `/debug/dashboard`     | 캐시 스트림 테스트 — 채널/채팅 캐시 CRUD·observe              |
| `DebugLogBufferPage`  | `/debug/log-buffer`    | 네이티브 앱 로그 버퍼 뷰어(fetch/stream/poll)                 |
| `DebugCacheTestPage`  | `/debug/cache-test`    | SQLite 브릿지 벤치마크(저장/조회·동시성·flood, 레이턴시 통계) |
| `DebugUploadPage`     | `/debug/upload-test`   | 멀티파일 청크 업로드 컨트롤러(pause/resume/cancel/retry)      |
| `DebugBadgeCountPage` | `/debug/badge-count`   | 앱 배지 카운트 fetch/set/clear                                |

## 게이팅 — 런타임 언락

env/빌드 플래그가 아니라 **런타임 제스처**로 연다. `DebugPage`에서 앱 버전 텍스트를 3초 내 10번 탭하면 `sessionStorage`(`chatic-debug-mode`)에 해제 상태가 저장된다. 세션 스코프라 탭/세션이 닫히면 사라진다.

- 라우트는 항상 마운트되지만(`PrivateRoutes`), 각 디버그 페이지는 `useDebugMode().isEnabled`를 확인하고 비활성이면 `/mypage`로 자동 리다이렉트한다.
- 디바이스에서 빌드/배포 없이 즉시 켤 수 있게 한 의도적 선택이다.

## 구조

```
features/debug/
  pages/      # 위 7개 화면
  hooks/      # useDebugMode — sessionStorage 언락 게이트 (registerTap/disable/isEnabled)
  consts/     # DEBUG_STORAGE_KEY = 'chatic-debug-mode'
  routes/     # DebugRoutes
  index.ts    # DebugRoutes, useDebugMode
```

## 주요 결정/특이점

- **네이티브 브릿지 검증 집중**: 업로드/로그/배지/SQLite를 `webClient.request()`·이벤트로 테스트해, 하이브리드 통합을 프로덕션 배포 없이 확인한다([bridge](../../architecture/bridge.md)).
- **성능 텔레메트리**: cache/upload 페이지가 레이턴시·throughput·에러율을 롤링 통계로 추적해 회귀를 잡는다.
- 재사용 가능한 패턴(복구 가능한 업로드 태스크 등)이 프로덕션 아키텍처의 레퍼런스 역할을 한다.
