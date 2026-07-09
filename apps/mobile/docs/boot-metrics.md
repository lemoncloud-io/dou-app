# 부팅 성능 계측 (Boot Metrics)

> 대상: `apps/mobile/src/app/services/perf/BootMetricsService.ts` · `apps/web/src/app/features/debug/metrics/`
> 관련: [webview](./webview.md) · [service](./service.md) · apps/web `docs/feature/debug/README.md`

앱 실행 → 웹뷰 인터랙티브까지의 부팅 타임라인을 네이티브+웹 양쪽에서 계측하고, 부팅 1회 = 기록 1건으로 MMKV에 영속화한다. 목적은 부팅 병목의 수치 확정과 최적화 전후 비교를 **기기에서 직접** 하는 것.

## 타임라인 구조

```
[네이티브 — BootMetricsService, 베이스라인: provider 생성(≈JS 엔트리)]
p1 provider-ready      DependencyProvider 동기 초기화 완료 (MMKV·SQLite·서비스)
p2 app-mount           루트 컴포넌트 트리 커밋
p3 main-screen-mount   웹뷰 스크린 마운트 (직후 네트워크 시작)
p4 load-start          WebView onLoadStart
p5 load-end            WebView onLoadEnd
p6 web-app-ready       WebAppReady 브릿지 수신 → totalMs

[웹 — bootMarks, 베이스라인: 페이지 로드 시작(timeOrigin)]
w0 main.tsx start · w1 app render · w2 session init(라우터 언블록)
+ Navigation Timing (TTFB·DCL·load)
+ /assets/ 번들별 캐시 히트 여부 (transferSize + duration 휴리스틱)
```

두 축은 서로 다른 기준점을 갖는다 — 네이티브 p4(load-start) ≈ 웹 0ms(timeOrigin)로 겹쳐 읽는다.

## 데이터 흐름

1. 웹이 라우터 언블록 후 3초 뒤(늦게 도착하는 리소스 엔트리 포함) `SendBootMetrics` 메시지로 스냅샷을 1회 전송 (`reportBootMetrics.ts`, 브라우저 단독 실행 시 스킵)
2. 네이티브 `usePerfHandler`가 수신 → `BootMetricsService.attachWebMetrics()`
3. `web-app-ready` 마크 + 웹 스냅샷이 모이면 기록 확정. 스냅샷이 5초 내 안 오면 `web: null`로 저장
4. MMKV `bootMetrics.records`에 최신순 50건 링버퍼

## 부팅 유형

| type     | 의미                                                                                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cold`   | 앱 프로세스 시작부터의 부팅                                                                                                                                                                 |
| `reload` | iOS 웹뷰 content process가 OS에 killed → `reload()` — 사실상 재부팅. `AppWebView.handleContentProcessDidTerminate`가 새 세션을 시작하며, 미완료 세션은 그 시점까지의 기록으로 먼저 저장된다 |

포그라운드 복귀는 별도 기록: `useResumeOverlay`가 active → DismissResumeOverlay(또는 1.5초 캡)까지의 소요를 `recordForegroundResume()`으로 남긴다.

## 확인 위치

- **FAB 디버그 메뉴 › 부팅 성능** (`BootPerformanceScreen`): 기록 리스트(유형·총시간·버전) → 탭하면 네이티브+웹 타임라인 상세. JSON 복사·초기화 지원
- **FAB 디버그 메뉴 › 모니터링** (`MonitoringScreen`): 메모리 사용량, 최근 복귀 소요, 웹뷰 프로세스 킬 누적 카운트
- **웹 디버그 오버레이 › 부팅 탭**: 현재 세션의 웹 측 타임라인 (웹 단독 개발 시)

## PROD에서 디버그 메뉴 열기 (단일 언락)

부팅 성능은 PROD에서 재현되는 문제이므로 런타임 언락 경로가 있다:

1. 웹 마이페이지 앱 버전 10탭 → 웹 디버그 모드 언락
2. 웹 `useDebugMode`가 `SetDebugMode` 브릿지 메시지 전송 → `debugSettingsStore.debugModeEnabled`(persist) 저장 → FAB 노출
3. 앱 재시작 후에도 네이티브 플래그가 살아 있고, 주입 스크립트 `window.CHATIC_APP_DEBUG_MODE`로 웹도 자동 언락 — 한 번의 언락이 양쪽을 계속 커버
4. 웹의 Disable Debug Mode 한 번으로 양쪽 동시 잠금

**보안 경계**: 런타임 언락(빌드 게이트 없이 열린 경우)에서는 FAB 메뉴에서 **환경설정(웹뷰 URL 오버라이드)이 제외**된다 — 프로덕션 앱이 임의 URL을 로드하는 면을 막기 위함 (`FloatingMenu.allowEnvironmentSettings`).

## 베이스라인 (v0.19.2, 콜드부팅 8건, 실기기)

JS 엔트리 기준 구간 평균:

| 구간                                             | 평균      | 범위     |
| ------------------------------------------------ | --------- | -------- |
| 네이티브 pre-webview (→load-start)               | **580ms** | 326–882  |
| └ JS엔트리→provider-ready                        | 56ms      | 15–118   |
| └ provider→app-mount                             | 68ms      | 5–168    |
| └ app-mount→main-screen (네비게이션 마운트)      | **251ms** | 98–446   |
| └ main-screen→load-start (WebView 인스턴스 생성) | **206ms** | 134–301  |
| 웹 로드+부팅 (load-start→web-app-ready)          | 518ms     | 325–1018 |
| totalMs (web-app-ready)                          | 1099ms    | 711–1643 |

관찰:

- **네이티브 pre-webview가 부팅의 53%.** 완전 직렬(provider → App → NavigationContainer → 네비게이터 → MainScreen → WebView 생성)이라 앞단 지연이 웹뷰 로드 시작을 통째로 밀어낸다. 네비게이션 마운트(251ms)와 WebView 인스턴스 생성(206ms)이 지배적.
- **`totalMs`는 체감 부팅이 아니다.** `web-app-ready`는 main.tsx 최상단(React 렌더 전)에서 발생. 실제 첫 화면은 웹 `sessionInit`(라우터 언블록) 이후 → 체감 부팅 ≈ native load-start + web sessionInit ≈ **평균 1255ms, 최대 2115ms**.
- **자산은 매 부팅 304 재검증**(`transferSize: 300` = 304 헤더). `no-cache` 정책 탓. 배포 직후엔 메인 청크 296KB 재다운로드.
- 콜드 변동은 provider-ready 15–29ms(빠름) vs 109–118ms(느림)로 갈림 — 느린 콜드는 전 구간이 비례해 밀린다(JS 번들 파싱/디스크 I/O).

→ 1차 최적화 대상: **네이티브 웹뷰 조기 마운트** (pre-webview 51%, 변동 폭까지 흡수).

## 주의사항

- 계측은 동기 최소 연산(타임스탬프 기록)만 부팅 경로에서 수행하고, 저장·전송은 확정 시점에 비동기로 한다.
- 같은 마일스톤 키는 세션당 최초 1회만 기록된다 (SPA 내비게이션이 load 이벤트를 재발화해도 무시).
- WKWebView는 Resource Timing의 `transferSize`를 0으로 줄 수 있어, 캐시 판정은 `decodedBodySize`/`duration<30ms` 보정을 병행한다 — 실기기에서 확인 필요.
