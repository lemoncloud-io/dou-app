# debug

> 대상: `apps/web/src/app/features/debug`

## 책임

개발자 전용 도구 묶음이다. 런타임 상태·성능 관찰, 인증 흐름 테스트, 캐시/DB 동작 점검, 업로드 모니터링, 로그 버퍼 조회 등 진단·테스트 도구를 제공한다.

과거에는 `/debug` 라우트 페이지(DebugPage 허브)와 DEV 전용 플로팅 패널(RuntimeOverlay)로 나뉘어 있었으나, **단일 오버레이(DebugOverlay)로 통합**했다. 오버레이는 라우터 밖(`app.tsx` 레벨)에 마운트되므로:

- 현재 화면을 언마운트하지 않고 그 위에서 조사할 수 있다 (디버깅 대상 상태 보존)
- Router가 `isInitialized`를 기다리며 null을 반환하는 **부팅 행(hang) 상황에서도 진입 가능**하다
- 모바일 네이티브 DebugOverlay와 같은 패턴(오버레이 + 내부 스택 내비)이다

## 두 가지 표시 모드

```
DebugOverlayHost (app.tsx 마운트, 게이트 통과 시 우하단 "debug" 플로팅 버튼)
├─ 미니 모드 (MiniPanel): 드래그 가능한 플로팅 패널 — 읽기 전용 실시간 관찰
│   └─ 탭: 상태(세션·서버·소켓) · 부팅(타임라인) · 성능(메트릭) · 안읽음
│       앱은 계속 조작 가능 (전체 화면 백드롭 없음)
└─ 확장 모드 (ExpandedSheet): 전체화면 시트 — 홈 메뉴 → 도구 스크린 스택
    └─ 스크린은 React.lazy — 오버레이 호스트가 상시 마운트여도 초기 번들에 미포함
```

## 도구 스크린 (확장 모드)

| 스크린                 | 키               | 설명                                                                |
| ---------------------- | ---------------- | ------------------------------------------------------------------- |
| `EmailLoginScreen`     | `EmailLogin`     | 이메일 로그인 테스트(`useLogin`)                                    |
| `LogBufferScreen`      | `LogBuffer`      | 로그 버퍼 뷰어(fetch/poll/clear) — 네이티브=앱 버퍼, 웹=메모리 버퍼 |
| `CacheTestScreen`      | `CacheTest`      | SQLite 브릿지 벤치마크(저장/조회·동시성·flood, 레이턴시 통계)       |
| `UploadTestScreen`     | `UploadTest`     | 멀티파일 청크 업로드 컨트롤러(pause/resume/cancel/retry)            |
| `PushScreen`           | `Push`           | 푸시 토큰 서버 등록여부 확인 + 포그라운드 수신 목록                 |
| `InviteRedirectScreen` | `InviteRedirect` | 공유 링크 → 초대 리다이렉트 URL 변환기                              |
| `DBBrowserScreen`      | `DBBrowser`      | 도메인 캐시 브라우저(repository observe 기반)                       |
| `ProfileEditorScreen`  | `ProfileEditor`  | 활성 place의 내 프로필(nick/thumbnail) 편집                         |
| `DeviceInfoScreen`     | `DeviceInfo`     | 네이티브 주입 deviceId/installId/platform (탭하여 복사)             |

Chat Test Dashboard, Badge Count Test 스크린은 통합 과정에서 제거했다.

## 성능 측정 (metrics/)

수집기는 `main.tsx`에서 부팅 즉시 시작되어 오버레이가 열리기 전 데이터까지 보관한다.

| 수집기             | 표시 위치           | 내용                                                                                                                                                        |
| ------------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bootMarks`        | 미니 모드 "부팅" 탭 | 부팅 타임라인 — Navigation Timing(TTFB·DCL·load) + 앱 마일스톤(main-start → app-render → session-initialized) + **/assets/ 번들별 캐시 히트/다운로드 크기** |
| `webVitalsStore`   | "부팅"·"성능" 탭    | FCP/LCP/TTFB/INP/CLS 최신값 (`initWebVitals` 리포터가 공급)                                                                                                 |
| `longTasks`        | "성능" 탭           | 메인 스레드 50ms+ 태스크 집계(건수·누적·최대), `buffered:true`로 부팅 중 jank 포함. WKWebView 미지원                                                        |
| `MetricsCollector` | "성능" 탭           | 채팅 처리량/레이턴시, 캐시 observe 카운트, 렌더 카운트, 소켓 연결 품질                                                                                      |

모든 값은 웹뷰의 **페이지 로드 시작(timeOrigin) 이후** 구간만 본다. 그 앞(앱 실행 → 웹뷰 생성)의 네이티브 구간은 모바일 `BootMetricsService`가 측정하며, 웹 스냅샷은 라우터 언블록 후 `SendBootMetrics` 브릿지 메시지로 1회 전송되어(`metrics/reportBootMetrics.ts`) 네이티브 기록에 합류한다. 합쳐진 부팅 기록(MMKV, 50건)은 모바일 FAB 디버그 메뉴의 "부팅 성능" 화면에서 본다 — `apps/mobile/docs/boot-metrics.md` 참고.

## 게이팅 — 런타임 언락

env/빌드 플래그가 아니라 **런타임 제스처**로 연다. 마이페이지의 앱 버전 텍스트를 3초 내 10번 탭하면 `sessionStorage`(`chatic-debug-mode`)에 해제 상태가 저장되고, 우하단에 "debug" 플로팅 버튼이 나타난다.

- `useDebugMode`는 모듈 레벨 시그널(`useSyncExternalStore`) 기반이라 **모든 훅 인스턴스가 즉시 동기화**된다 — 마이페이지에서 언락하면 상시 마운트된 오버레이 호스트가 바로 반응한다.
- DEV/LOCAL 빌드(`isDevEnv`)에서는 언락 없이 자동 활성.
- 확장 모드 홈 하단의 "Disable Debug Mode"로 다시 잠근다. 세션 스코프라 탭이 닫히면 초기화된다.
- **네이티브 셸에서는 단일 언락**: 언락/잠금이 `SetDebugMode` 브릿지 메시지로 네이티브에 전파되어 모바일 FAB 디버그 메뉴도 함께 열린다(PROD 포함). 네이티브는 플래그를 persist하고 재시작 시 주입 전역 `CHATIC_APP_DEBUG_MODE`로 웹을 자동 언락하므로, 앱에서는 세션이 끊겨도 다시 탭할 필요가 없다.

## 구조

```
features/debug/
  overlay/            # 통합 오버레이
    DebugOverlayHost  #   진입점(게이트 + 플로팅 버튼), app.tsx에 마운트
    overlayStore      #   모듈 레벨 내비 상태머신 (open/close/expand/minimize/selectScreen/goBack)
    debugMenu         #   스크린 키·메뉴 정의 (모바일 debugMenu.ts의 웹 버전)
    screenRegistry    #   키 → React.lazy 스크린 매핑
    MiniPanel / ExpandedSheet
    tabs/             #   관찰 탭 — StateTab, BootTab, PerfTab, UnreadTab
    screens/          #   도구 스크린들 (+ DBBrowser)
  metrics/            # 수집기 — bootMarks, longTasks, webVitalsStore, MetricsCollector
  components/         # Row, Section (오버레이 공용 표시 조각)
  hooks/              # useDebugMode(언락 게이트), usePushRegistration, useReceivedPushLog
  lib/                # 순수 헬퍼 — buildDeviceInfoRows, copyText, isDevEnv, ...
  consts/             # DEBUG_STORAGE_KEY = 'chatic-debug-mode'
```

푸시 검증 절차는 [push-verification](./push-verification.md) 참고.
