# 로깅

> 대상: `libs/logger`(`@chatic/logger`) · `libs/bridges/src/logger`(`@chatic/bridges`) · `apps/web/src/main.tsx` · `apps/web/src/app/runtime/webLogPersistence.ts`
>
> **통합 로깅 전체(모바일 재배선·지연 리포트·감지 확장 포함)의 정본은
> [libs/logger/docs/architecture.md](../../../../libs/logger/docs/architecture.md)다.**
> 이 문서는 apps/web 관점의 배선만 요약한다. 결정 배경은 [ADR-0047](../../../../docs/adr/0047-unified-logging-core-and-report-traceability.md).

앱 전역 로깅은 `logger.{debug,info,warn,error}(tag, message, data)` 한 API로 통일돼 있다. 호출부는 환경(웹/네이티브)을 몰라도 되고, 로그를 **어디로 흘려보낼지는 구독자(sink)가 결정**한다 — pub/sub 구조다. ADR-0047 이후 모바일도 같은 코어를 쓰므로, `LogEntry` 계약은 웹·네이티브·wire 전 구간에서 하나다.

## 값 모델

```ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
    level: LogLevel;
    tag: string;
    message: string;
    data?: unknown;
    error?: unknown;
    timestamp: number; // dispatch 시점에 코어가 찍는다 — 경계를 건너도 재스탬프되지 않는다
    source?: 'web' | 'native'; // 런타임 경계를 건넌 엔트리만 표시
}
```

- `LogLevel`은 코어(`@chatic/logger`)가 자체 정의한다 — `@chatic/app-messages`의 `AppLogLevel`과 동일 문자열 유니온이지만 코어의 의존성을 0으로 유지하기 위해 끊었다.
- 브리지를 건너온 엔트리는 `ingestLogEntry`로 적재되어 원본 timestamp·tag·source가 보존된다.

## 웹 배선 (`main.tsx`, 부팅 순서대로)

| 순서 | 호출                                          | 역할                                                                                                        |
| ---- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1    | `setupBridgeLogger({ consoleInNative: DEV })` | sink 배선: 네이티브면 SendLog 포워더(+dev 콘솔), 웹이면 콘솔                                                |
| 2    | `attachWebLogPersistence()`                   | sessionStorage 영속화(디바운스 1s, error 즉시) + alive 센티널 + 직전 세션 크래시 판정                       |
| 3    | `schedulePageCrashReport(...)`                | 직전 세션이 pagehide 없이 죽었으면 그 버퍼를 breadcrumb으로 `page-crash` 사후 리포트 (load+3s)              |
| 4    | `setReportLogSource(nativeMergedLogSource)`   | 하이브리드 한정 — 리포트 breadcrumb 소스를 네이티브 통합 버퍼로 교체                                        |
| 5    | `schedulePendingReportFlush()`                | 하이브리드 한정 — 네이티브 지연 리포트 큐(WebView 크래시·RN 예외·네이티브 크래시)를 pull해 대리 전송 후 Ack |

- **내장 버퍼(500)는 구독과 무관하게 항상 적재**한다. 배선 전(부팅 초기)에 찍힌 로그도 유실되지 않는다.
- **구독자가 하나도 없으면** facade가 콘솔 폴백으로 직접 출력한다 — `setupBridgeLogger`를 부르지 않는 앱(desktop-web·admin·landing·testbed)도 기존 콘솔 동작을 그대로 유지한다.
- 웹 버퍼는 sessionStorage로 영속되어 **크래시→리로드에도 살아남는다** (탭을 닫으면 사라짐 — redact 미적용 로그의 잔존을 줄이는 의도된 선택).

## 전역 에러 감지 (`app.tsx`)

모든 감지는 **로깅 먼저, 리포트는 그다음** — 에러 자체가 버퍼의 일급 엔트리가 되어 스로틀로 리포트가 생략돼도 breadcrumb에는 남는다.

| 경로                                    | 카테고리                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `window.onerror` (bubble)               | uncaught 예외 — opaque면 `script-error` (합성 stack은 싣지 않고 `stackSynthetic` 표시, 위치를 message에 노출) |
| `unhandledrejection`                    | `unhandled-rejection` (http/network 성격이면 해당 분류 우선)                                                  |
| `error` (capture)                       | `<img>`/`<script>`/`<link>` 등 리소스 로드 실패 → `resource-error`                                            |
| `securitypolicyviolation`               | `csp-violation` — WebView 안 차단 스크립트는 Script Error 원인군 단서                                         |
| Query/Mutation `onError`, ErrorBoundary | 기존 유지                                                                                                     |

## 리포트 breadcrumb

`reportError`/`reportIssue`/이슈 위젯은 `collectBreadcrumbs`(@chatic/bridges)를 쓴다: 활성 `LogSource`에서 tail 50을 pull(하이브리드 = 네이티브 통합 버퍼, 1.5s 타임아웃)하고, `reportError`는 에러 이후 끼어든 로그를 `timestamp <= errorAt`으로 걸러낸다. 실패 시 에러 시점의 동기 웹 스냅샷으로 폴백.

## 디버그 UI 통합

`LogBufferScreen`(debug 오버레이)은 로그 소스를 환경에 따라 바꾼다 — 네이티브는 `FetchAppLogBuffer` 브리지 왕복, 순수 웹은 `webLogSource`의 동기 조회. `webLogSource`는 poll/clear까지 필요한 별도 표면이라 리포트 경로의 `LogSource`와 분리 유지한다. 하이브리드의 네이티브 버퍼에는 이제 웹 로그가 **원본 tag·발생 시각·`source:'web'`** 그대로 보인다.

## 관련

- 통합 아키텍처 정본: [libs/logger/docs/architecture.md](../../../../libs/logger/docs/architecture.md)
- 브릿지 메시지 규약은 [bridge](./bridge.md).
- 디버그 오버레이·`LogBufferScreen`은 [debug feature](../feature/debug/README.md).
- 에러 리포트 경로 상세는 [libs/web-core/docs/error-reporting.md](../../../../libs/web-core/docs/error-reporting.md).
