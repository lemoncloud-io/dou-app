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
| 2    | `attachWebCrashSentinel()`                    | alive 센티널 + 직전 세션 크래시 판정                                                                        |
| 3    | `schedulePageCrashReport(...)`                | 직전 세션이 pagehide 없이 죽었으면 `page-crash` 사후 리포트 (load+3s) — 로그는 싣지 않는다                  |
| 4    | `schedulePendingReportFlush()`                | 하이브리드 한정 — 네이티브 지연 리포트 큐(WebView 크래시·RN 예외·네이티브 크래시)를 pull해 대리 전송 후 Ack |

- **내장 버퍼(500)는 구독과 무관하게 항상 적재**한다. 배선 전(부팅 초기)에 찍힌 로그도 유실되지 않는다.
- **구독자가 하나도 없으면** facade가 콘솔 폴백으로 직접 출력한다 — `setupBridgeLogger`를 부르지 않는 앱(desktop-web·admin·landing·testbed)도 기존 콘솔 동작을 그대로 유지한다.
- 웹 버퍼는 메모리에만 있다. 리포트가 로그를 첨부하지 않게 된 뒤로 sessionStorage 영속화는 읽는 곳이 없어져 제거했다(2026-08-21) — 서버로 나가야 할 것은 업로드 큐(localStorage)가 따로 들고 있다.

## 전역 에러 감지 (`app.tsx`)

모든 감지는 **로깅 먼저, 리포트는 그다음** — 에러 자체가 버퍼의 일급 엔트리가 되므로, 리포트가 생략돼도 그 엔트리는 업로드 파이프라인을 타고 서버에 남는다.

| 경로                                    | 카테고리                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `window.onerror` (bubble)               | uncaught 예외 — opaque면 `script-error` (합성 stack은 싣지 않고 `stackSynthetic` 표시, 위치를 message에 노출) |
| `unhandledrejection`                    | `unhandled-rejection` (http/network 성격이면 해당 분류 우선)                                                  |
| `error` (capture)                       | `<img>`/`<script>`/`<link>` 등 리소스 로드 실패 → `resource-error`                                            |
| `securitypolicyviolation`               | `csp-violation` — WebView 안 차단 스크립트는 Script Error 원인군 단서                                         |
| Query/Mutation `onError`, ErrorBoundary | 기존 유지                                                                                                     |

## 리포트와 로그의 관계

**리포트는 로그를 첨부하지 않는다(2026-08-21).** `reportError`·`reportIssue`·페이지 크래시·네이티브 대리 전송 어느 쪽도 마찬가지다. 로그는 배치 업로더가 엔트리 낱건으로 `/hello/report-bulk`에 올리므로, 리포트에 사본을 실으면 같은 로그가 두 벌 저장되고 그 사본만 공유 Slack 채널로도 나간다. 둘을 잇는 축은 엔트리마다 실려 있는 `runId`(+`uid`)다 — 어드민에서 리포트의 runId로 그 실행의 로그 전체를 좁힌다.

`LogSource`·`collectBreadcrumbs`·`setReportLogSource`는 함께 제거됐다. 네이티브 통합 버퍼를 읽는 경로는 디버그 오버레이의 `peek` 하나만 남는다 — 서버로 갈 엔트리는 앱 전송 큐가 따로 들고 있다(ADR-0063).

## 디버그 UI 통합

`LogBufferScreen`(debug 오버레이)은 로그 소스를 환경에 따라 바꾼다 — 네이티브는 `FetchAppLogBuffer` 브리지 왕복, 순수 웹은 `webLogSource`의 동기 조회. `webLogSource`는 poll/clear까지 필요한 별도 표면이라 리포트 경로의 `LogSource`와 분리 유지한다. 하이브리드의 네이티브 버퍼에는 이제 웹 로그가 **원본 tag·발생 시각·`source:'web'`** 그대로 보인다.

## 관련

- 통합 아키텍처 정본: [libs/logger/docs/architecture.md](../../../../libs/logger/docs/architecture.md)
- 브릿지 메시지 규약은 [bridge](./bridge.md).
- 디버그 오버레이·`LogBufferScreen`은 [debug feature](../feature/debug/README.md).
- 에러 리포트 경로 상세는 [libs/web-core/docs/error-reporting.md](../../../../libs/web-core/docs/error-reporting.md).
