# 전 유저 대상 이슈 리포트 플로팅 위젯을 신규 독립 기능으로 만들고, 스크린샷은 Phase 2로 분리한다

> 상태: Accepted · 결정일: 2026-07-16

## 맥락 (Context)

전 유저가 앱 어디서든 버그/이슈를 신고할 수 있는 기능을 만든다. 요구사항은 다음과 같다.

- 우측 하단에 **플로팅 버튼**으로 상주하며, 드래그로 **위치 변경 가능**
- 플로팅으로 열리는 **이슈 리포팅 오버레이(폼)** 도 위치 변경 가능
- `@libs/web-ui-kit` 컴포넌트 활용
- **이슈 타이틀 + 본문 + 스크린샷** 첨부 전송
- **최근 로그 50개, 디바이스 및 웹 상태**를 자동 추출·조합해 함께 전송

착수 전 코드베이스 조사로 확인한 사실(재사용 가능한 기존 자산):

- **이슈 폼과 전송 API가 이미 존재하나 어디에도 마운트되지 않음** — `apps/web/src/app/ui/components/ReportIssueDialog.tsx`, `reportIssue()` (`libs/web-core/src/api/common.ts:125`). `reportIssue`는 이미 env/url/user/cloud 컨텍스트를 자동 첨부해 Slack 리포트 엔드포인트(`${DOU_ENDPOINT}/hello/report`)로 POST 한다.
- 로그: `logBuffer.peek(50)` (`@chatic/bridges`, 500개 링버퍼 — `libs/logger/src/logger.ts:44`) 로 최근 50개 즉시 획득.
- 디바이스/버전: `useDeviceInfo()` → `{ deviceInfo, versionInfo }` (`libs/device-utils/src/hooks/useDeviceInfo.ts`). 세션/유저/서버 컨텍스트: `getGlobalSessionContext()` / `getActiveSessionUser()` (web-core).
- 드래그 패턴: `apps/web/src/app/features/debug/overlay/MiniPanel.tsx` 에 포인터 이벤트 기반 드래그 + 뷰포트 클램프가 이미 구현됨(단 위치 영속화는 없음). 고정 플로팅 버튼 패턴은 `DebugOverlayHost.tsx`.
- 설정 영속화 패턴: `usePreferenceStore` + `PREFERENCES` 레지스트리(`apps/web/src/app/stores/`), MyPage의 `ListRow` + `Switch` 토글(`MyPage.tsx:168`).
- **UI 키트 계층**: `@chatic/web-ui-kit`(제품 디자인 시스템: FloatingButton/BottomSheet/TextField/Button)은 내부적으로 `@chatic/ui-kit`(shadcn 프리미티브)을 감싼다. 둘은 경쟁 관계가 아니라 상하위 계층이다. 단 web-ui-kit에는 멀티라인 Textarea가 없다.
- **스크린샷/이미지 인프라 부재**: 스크린샷 "캡처" 네이티브 브릿지 명령 없음, presigned/S3 이미지 호스팅 업로드 인프라 없음. 앱의 이미지 관례는 `resizeImageToBase64`를 통한 **base64 data URL** 인라인 전송. 네이티브 `OpenPhotoLibrary`/`OpenCamera` 브릿지는 `includeBase64` 옵션은 있으나 이를 감싼 웹 훅은 아직 없음.

## 결정 (Decision)

### 범위·대상

- **대상: 모든 최종 사용자.** 프로덕션 포함 항상 노출되는 플로팅 위젯(내부/디버그 게이팅 없음).
- **신규 독립 기능**으로 제작(`apps/web/src/app/features/issue-report/`). 기존 `ReportIssueDialog`를 확장하거나 debug 오버레이에 통합하지 않는다. 단, 아래 로직 자산은 **재사용**한다: `reportIssue()`, `logBuffer`, `useDeviceInfo()`, 세션 컨텍스트 리더, MiniPanel의 드래그 패턴, `usePreferenceStore` 패턴.
- **플레인 웹 + 네이티브 웹뷰 공통 지원** (`isNative()`로 분기).

### UI

- `@chatic/web-ui-kit` 컴포넌트로 구성(오버레이는 BottomSheet, 입력은 TextField, CTA는 FloatingButton/Button). 멀티라인 본문은 web-ui-kit에 Textarea가 없어 `@chatic/ui-kit`의 Textarea를 폴백 사용(web-ui-kit가 ui-kit 상위 계층이므로 정합적).
- **플로팅 버튼**: 우하단 기본 위치, 포인터 드래그로 이동(MiniPanel 패턴 재사용), 뷰포트 클램프.
- **오버레이 폼**: 위치 이동 가능.
- **위치·표시 상태 영속화**: 위치는 feature 전용 store(localStorage 백업)에 저장해 재방문 시 유지. 사용자가 버튼을 **숨길 수 있고**, 숨긴 뒤 **복구는 환경설정(MyPage) 토글**에서 처리(`usePreferenceStore`에 `local` strategy 키 추가).

### 전송 payload (v1)

- 기존 `reportIssue()`를 **확장**해 payload에 다음을 추가한다: `logs`(`logBuffer.peek(50)`), `device`/`version`(`useDeviceInfo()` 결과). 기존 user/cloud/env/url/timestamp는 그대로 유지.
- **전송 목적지는 기존 Slack 리포트 엔드포인트(`/hello/report`) 유지.**
- **로그·디바이스 상태는 스크러빙 없이 자동 첨부**(v1). 별도 동의 절차 없음.

### 스크린샷 → Phase 2로 분리

- **v1 범위 제외.** v1은 타이틀 + 본문 + 로그 50개 + 디바이스/웹 상태만 전송한다.
- Phase 2 방향(확정된 방침): 캡처는 **네이티브 톤 라이브러리/카메라 선택**(기존 `OpenPhotoLibrary`/`OpenCamera` 브릿지, 신규 네이티브 캡처 명령 없이), 플레인 웹은 `<input type=file>` 폴백. **전송 경로는 미해결 — 별도 설계 필요**(현재 Slack 텍스트 엔드포인트로는 이미지를 실을 수 없어 백엔드 이미지 엔드포인트 신설이 유력하며 크로스팀 작업).

## 대안 (Alternatives)

- **기존 ReportIssueDialog 확장 / debug 오버레이 통합** — 가장 빠르나 debug 오버레이는 내부용 게이팅이라 전 유저 노출과 성격이 다르고 폼 UI 자유도가 떨어진다. → 로직만 재사용하고 UI는 신규 독립 기능으로.
- **스크린샷 캡처: 웹 DOM 캡처(html-to-image)** — 신규 의존성으로 이 레포 안에서 자기완결 가능하나 크로스오리진 이미지/canvas/video 누락 등 정확도 한계. → 톤 라이브러리/카메라 선택으로 결정.
- **스크린샷 캡처: 신규 네이티브 캡처 명령(`OnCaptureScreenshot`)** — "현재 화면 자동 캡처" UX에 가장 부합하나 네이티브 앱(별도 레포) 신규 개발 필요. → 채택하지 않음.
- **이미지 전송: base64 인라인(기존 관례)** — 백엔드 작업 최소지만 Slack에 이미지로 렌더되지 않고 텍스트 용량 한계 리스크. → v1에서 스크린샷 자체를 이연하며 보류.
- **플로팅 위치: 세션 동안만 유지** — 구현은 단순하나 "위치 변경 가능"의 기대(재방문 유지)에 못 미침. → store+localStorage 영속화로 결정.

## 결과 (Consequences)

**얻는 것**

- 기존 `reportIssue`/`logBuffer`/`useDeviceInfo`/드래그 패턴/preference 패턴 재사용으로 중복 최소화, 빠른 출시.
- 전 유저 셀프서비스 이슈 신고 + 자동 컨텍스트(로그·디바이스·유저·서버)로 디버깅 효율 상승.
- 스크린샷을 Phase 2로 떼어내 v1을 이 레포 안에서 자기완결·백엔드 의존 없이 출시 가능.

**감수하는 트레이드오프 / 리스크**

- **요구사항 부분 이연**: 스크린샷 전송이 v1에 없음.
- **프라이버시**: 로그 50개가 스크러빙 없이 전송되어 토큰·개인정보가 Slack으로 노출될 수 있음. (현재는 명시적으로 감수)
- **채널 노이즈**: 전 유저 리포트가 내부 Slack 리포트 채널로 유입되어 스팸/노이즈 가능. 목적지·라우팅 재검토가 향후 필요할 수 있음.
- **payload 비대화**: 로그 50개 첨부로 요청 크기가 커져 전송 실패/절단 가능성. 크기 상한·트렁케이션 정책을 스펙 단계에서 정한다.
- **복구 발견성**: 버튼을 숨기면 복구가 환경설정에 의존 → 발견성이 낮을 수 있음. 환경설정 내 배치·문구를 명확히 해야 함.
- **Phase 2 백엔드 의존**: 스크린샷 전송을 위해 백엔드 이미지 엔드포인트 신설(크로스팀)이 선행되어야 함.
