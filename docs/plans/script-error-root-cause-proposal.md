# "Script error." 근본 개선 제안

> 상태: **원인 1건 확인·수정 완료** (2026-08-04) · [ADR-0029](../adr/0029-error-report-categorization-and-enrichment.md)가 분리해 둔 "근본 원인 검증 스파이크"의 실행 제안

## 1. 증상 해부 — 지금 리포트가 말해주는 것과 속이는 것

프로덕션/개발 모바일에서 계속 쌓이는 대표 리포트:

```json
{
    "title": "[mobile] script-error",
    "message": "Script error.",
    "stack": "@https://dou-dev.chatic.io/assets/index-ZmwXwnnh.js:2:1129853",
    "userAgent": "... (DOU_IOS; DoU_Dev/0.21.1; iOS; Build:69)"
}
```

이 리포트에서 사실인 것과 아닌 것을 구분해야 한다.

| 필드                          | 실제 의미                                                                                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `message: "Script error."`    | 브라우저가 **크로스오리진으로 판정한 예외를 마스킹**한 문구. 원본 메시지가 아니다.                                                                                                                                        |
| `stack: index-*.js:2:1129853` | **가짜 단서.** `event.error == null`이라 전역 핸들러([apps/web/src/app/app.tsx:27](../../apps/web/src/app/app.tsx))가 `new Error(event.message)`로 합성한 Error의 스택 — 즉 **핸들러 자신의 위치**다. 원인 위치가 아니다. |
| `location` 없음               | `ErrorEvent.filename/lineno/colno`가 전부 비어 있었다는 뜻(진짜 opaque). ADR-0029로 캡처는 이미 붙어 있고, 이 케이스는 브라우저조차 위치를 안 준 것.                                                                      |
| `logs` 없음                   | breadcrumb 링버퍼 tail이 비어 있었거나 리포트 시점(부팅 직후 `path: "/"`)까지 로그가 없었음.                                                                                                                              |

핵심: **캡처는 ADR-0029에서 이미 개선됐고, 남은 문제는 (a) 가짜 stack이 오독을 유발하는 것, (b) 원본 예외가 애초에 마스킹되는 것** 두 가지다.

## 2. 원인 후보 — 왜 same-origin인데 마스킹되나

페이지(`dou-dev.chatic.io`)와 번들(`dou-dev.chatic.io/assets/…`)은 같은 오리진이고, [apps/web/index.html](../../apps/web/index.html)에는 서드파티 `<script>`가 없다(폰트 preconnect뿐). 그런데도 opaque라면 남는 후보는:

1. **(확인·수정됨) 네이티브 주입 스크립트 자체의 SyntaxError** — [apps/mobile/src/app/webview/utils/injectionScripts.ts](../../apps/mobile/src/app/webview/utils/injectionScripts.ts)의 `getDeviceInfoScript`가 `DeviceInfo`에서 받은 네이티브 문자열(앱 표시 이름, 기기 모델 등)을 이스케이프 없이 `'${value}'` 형태로 JS 문자열 리터럴에 그대로 꽂아 넣고 있었다. 값에 홑따옴표/백슬래시가 하나라도 섞이면 리터럴이 깨져 **이 주입 스크립트 자체가 SyntaxError로 죽는다.** 이 스크립트는 `injectedJavaScript`/`injectedJavaScriptBeforeContentLoaded`([AppWebView.tsx](../../apps/mobile/src/app/webview/AppWebView.tsx))로 실행되는 WKUserScript라 문서 URL이 없어, window.onerror에 **filename 없이 "Script error."로** 도착한다. `app: mobile`만 발생·`path: "/"`(부팅 직후)·`location` 전무라는 관측과 전부 정합. **P2-대체 수정**: 모든 문자열 보간을 `JSON.stringify()`로 교체(이 세션에서 적용, 회귀 테스트 포함) — 네이티브 협업 불필요, `apps/mobile` 단독 수정.
2. **(잔존 가능성) 그 외 네이티브 주입/콜백 코드** — 1의 수정은 `getDeviceInfoScript`에 한정된다. `javascript:` 콜백, 푸시/딥링크 핸들러 등 다른 주입 지점에서 같은 계열의 예외가 여전히 발생할 수 있다. 1의 배포 후에도 `[mobile] script-error`가 계속 관측되면 이 후보를 조사한다.
3. 서드파티 스크립트/확장 — 웹뷰에는 해당 없음(스크립트 태그 부재 확인). 웹 데스크톱에서만 유효한 후보.

## 3. 제안 — 4단계

### P1. 리포터 정직화 (web-core/apps-web, 반나절)

- `errorWasNull`인 리포트에는 합성 stack을 **싣지 않는다**(또는 `stackSynthetic: true`를 함께 실어 admin/Slack에서 구분). 가짜 위치 제거가 목적.
- admin-v2 상세 Drawer에서 `script-error`+stack 없음 조합에 "크로스오리진 마스킹됨" 배지를 붙여 트리아지 시간 낭비를 막는다.

### P2. 나머지 네이티브 주입 코드 try/catch + 브릿지 리포트 (네이티브 협업)

- 2절의 `getDeviceInfoScript` 이스케이프 버그는 이번 세션에서 직접 수정했다(코드 레벨로 확정 가능한 원인이었으므로 시뮬레이터 검증 없이 적용). 남은 건 다른 주입 지점(`javascript:` 콜백, 푸시/딥링크 핸들러 등)에 대한 안전망이다.
- iOS/Android 쉘이 주입·실행하는 그 외 JS 조각을 `try { … } catch (e) { window.__reportNativeScriptError?.(scriptTag, e) }`로 감싸고, 웹은 이를 받아 `reportError(e, { source: 'manual' })`로 올린다. 스크립트 조각마다 식별 태그를 붙인다.
- 검증: 이스케이프 수정 배포 후에도 `[mobile] script-error`가 계속 관측되면, 남은 주입 스크립트에 의도적 `throw`를 심어 (a) 현재 경로로는 "Script error."가 오고 (b) 새 경로로는 실메시지+태그가 오는지 시뮬레이터에서 확인한다.

### P3. 소스맵 심볼리케이션 (배포 + admin-v2)

- dev는 이미 소스맵이 배포된다([vite.config.mts:148](../../apps/web/vite.config.mts) `sourcemap: VITE_ENV !== 'PROD'`). prod는 `'hidden'`으로 생성해 배포(또는 내부 보관).
- admin-v2 ReportDetailDrawer에 "원본 위치 보기": 스택 프레임 `url:line:col`의 `url + '.map'`을 fetch해 원본 `파일:줄`로 복원. **script-error가 아닌 모든 카테고리**(react-render, unhandled-rejection, 합성 아닌 스택)의 minified 스택이 즉시 실용화된다.

### P4. 커버리지·노이즈 (선택)

- window `error`를 **capture phase**로도 구독해 리소스 로드 실패(`<script>`/`<link>`/`<img>`)를 `resource-error` 카테고리로 분리 수집 — 현재는 버블 단계라 아예 안 잡히는 사각지대. 자산 로드 실패 직후의 연쇄 script-error 상관을 볼 수 있게 된다.
- script-error 스로틀 키(`category|message`)는 전부 한 버킷이므로, `location`이 있을 때는 `filename:lineno`를 fingerprint에 포함해 서로 다른 원인이 뭉개지지 않게 한다.

## 4. 우선순위 판단

2절의 이스케이프 버그 수정이 이미 배포 대기 중(다음 모바일 릴리즈에 포함되면 `[mobile] script-error` 볼륨이 눈에 띄게 줄어야 한다 — 이게 관측 가능한 성공 지표). P1은 리스크 없이 오독만 제거하므로 즉시. P2(남은 주입 지점)는 이스케이프 수정 배포 후 재관측 결과를 보고 필요 시 네이티브 릴리즈 사이클에 맞춰 진행. P3는 script-error 외 전 카테고리의 체감 개선 폭이 가장 크고 admin-v2 단독으로 진행 가능(dev부터). P4는 여력이 있을 때.
