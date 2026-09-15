# ADR-0049: 피드백 사진 첨부를 인라인 base64로 붙이고, 첨부가 있는 제보는 알림 없이 저장만 한다

> 상태: Accepted · 결정일: 2026-08-11
> 관련: [ADR-0047](./0047-feedback-page-replaces-issue-report-floating-widget.md) (사진 첨부 보류 결정을 이 ADR이 해제) · [ADR-0017](./0017-issue-report-floating-widget.md) (Superseded, 스크린샷을 Phase 2로 분리)

## 맥락 (Context)

[ADR-0047](./0047-feedback-page-replaces-issue-report-floating-widget.md)은 의견 보내기 화면에서 **사진 첨부를 통째로 제외**했다. 근거는 하나였다 — "이미지 업로드 API가 없다". Figma도 해당 프레임에 `서버 스펙 구현이후 연동`이라는 개발 주석을 달아두었다.

그 전제가 이번에 바뀌었다. 업로드 API를 기다리는 대신 **인라인 base64**로 보내기로 했다. 이 앱은 이미 그 방식을 쓴다 — 프로필·플레이스·채널 이미지가 전부 `resizeImageToBase64`로 data URL을 만들어 전송한다. 별도 호스팅 인프라 없이 첨부를 붙일 수 있는 경로가 이미 있는 셈이다.

### 착수 전 조사에서 나온 진짜 제약

**payload가 곧 Slack 메시지 텍스트다.** `reportIssue`는 payload 전체를 `JSON.stringify`해서 `SlackReportBody.message`에 넣고 `silent: false`로 보낸다([common.ts](../../libs/web-core/src/api/common.ts)). Slack 텍스트 상한은 약 40,000자인데, 1024px JPEG 한 장의 base64만 해도 10만 자를 넘는다. 사진을 기존 payload 경로에 그대로 실으면 **리포트 전송 자체가 실패**할 수 있고, 이 엔드포인트(`/hello/report`)는 자동 에러 리포팅(`reportError`)과 공유하므로 여파가 피드백 화면에 그치지 않는다.

**분리해 실을 자리는 계약에만 있고 실제로는 없다.** `SlackReportBody.meta?: Record<string, any>`("추가 컨텍스트")가 Slack 텍스트와 분리된 자리로 보였고 실제로 그렇게 구현했으나, dev 실측에서 **백엔드가 클라이언트 `meta`를 저장하지 않는다**는 것이 확인됐다(아래 결정 1). [admin-v2 report-logs 스펙](../../apps/admin-v2/docs/specs/report-logs/spec.md)이 "저장 형태 미확인"이라 적어둔 대목이 이것으로 판명된 셈이다. 결국 **저장되는 필드는 `message` 하나뿐**이다.

**기존 리사이저는 이 용도에 맞지 않는다.** `resizeImageToBase64`는 150px **정사각 center-crop**이다. 아바타용으로는 맞지만 화면 캡처에 쓰면 사진의 대부분을 잘라내 버려 진단 가치가 0이 된다.

## 결정 (Decision)

### 1. 사진은 payload에 싣고, 첨부가 있는 제보만 `silent: true`로 보낸다

`extras.images`는 나머지 `extras`와 함께 payload에 담겨 `body.message`로 간다. 대신 **첨부가 있을 때만** `silent: true`를 세워 Slack 전송을 끄고 저장만 한다. 첨부가 없는 제보는 종전대로 `silent: false`라 알림이 그대로 뜬다.

**`meta`를 먼저 시도했고, 실패했다.** `SlackReportBody.meta`("추가 컨텍스트")로 분리해 보내면 Slack 텍스트를 가볍게 유지한 채 사진만 따로 저장할 수 있으리라 보고 그렇게 구현했다. dev 임시 배포로 사진을 붙여 제보한 결과 저장 레코드의 `meta`가 **`{}`로 비어 돌아왔다** — 백엔드는 클라이언트가 보낸 `body.meta`를 저장하지 않는다.

```jsonc
// 사진을 첨부해 보냈는데도 meta가 비어 있다 (2026-08-11, dou-d1)
{ "title": "[web] issue: …", "message": "{…payload…}", "meta": {}, "silent": false, "save": true, "id": "1009178" }
```

저장되는 자리가 `message` 하나뿐인 이상, 사진을 남기려면 payload에 싣는 수밖에 없다. 그리고 payload에 실으면 Slack 상한을 넘으므로 그 제보의 알림을 포기하는 것이 대가다. **알림보다 사진이 남는 쪽을 골랐다** — 알림은 관리자 콘솔로 대체 가능하지만, 저장되지 않은 사진은 복구할 방법이 없다.

### 2. 인코딩 예산: 긴 변 1024px · JPEG 0.6 · 최대 5장

`libs/shared`에 `scaleImageToDataUrl`을 새로 추가한다 — **비율을 유지하고 전체 프레임을 남기는** 축소로, 업스케일은 하지 않는다. 기존 `resizeImageToBase64`(정사각 crop)는 아바타용으로 그대로 둔다.

base64는 3바이트를 4바이트로 부풀리므로 이 두 숫자가 곧 요청 크기의 상한이다. 장당 약 60~100KB, 5장이면 1MB 미만이다.

### 3. 관리자 조회는 방어적으로 탐색한다

`parseReportLog`가 기존 스타일대로 여러 지점을 순서대로 뒤진다 — payload의 `images`(현행 전송 경로) → SlackReportBody 래퍼의 `meta.images` → 레코드 meta 자체의 `images` → 레코드 최상위. `meta` 지점을 남겨두는 이유는 짧게 배포됐던 meta 빌드의 제보와, 백엔드가 나중에 `meta`를 저장하게 될 경우를 위해서다. `<img src>`가 실제로 렌더할 수 있는 값(`data:image/…`, `http(s)://`)만 통과시켜, 엉뚱한 필드가 URL을 주입하지 못하게 한다.

원본 JSON 블록에서는 base64를 마커로 치환해 렌더한다. 첨부 몇 장이면 raw 블록이 수 MB 텍스트가 되어 아무도 읽지 않는 것을 브라우저만 레이아웃하게 된다.

## 대안 (Alternatives)

- **`SlackReportBody.meta`로 분리 전송** — Slack 텍스트를 가볍게 유지하면서 사진만 저장할 수 있어 처음 채택했으나, 백엔드가 클라이언트 `meta`를 저장하지 않아 **실측에서 사진이 유실**됐다(위 결정 1). 백엔드가 `meta`를 보존하도록 바뀌면 이 경로가 다시 최선이다.
- **업로드 API를 기다린다** — ADR-0047의 원래 입장. 앱에 이미 base64 관례가 있는데 기능을 무기한 묶어두는 비용이 크다고 보고 기각.
- **`SlackReportBody.image` 사용** — 계약상 "썸네일 이미지 **URL**"이고 Slack은 data URI를 렌더하지 않는다. 한 장만 담을 수 있는 점도 맞지 않아 기각.
- **`resizeImageToBase64` 재사용** — 새 함수를 안 만들어도 되지만 150px 정사각 crop이라 화면 캡처가 판독 불가능해진다. 기각.

## 결과 (Consequences)

**얻는 것**

- 업로드 인프라 없이 제보에 화면 캡처가 붙는다. 텍스트 설명만으로는 재현이 어려운 리포트의 진단 가치가 크게 올라간다.
- 첨부 없는 제보는 아무것도 달라지지 않는다 — Slack 알림도, 요청 형태도 그대로다.
- `PhotoAttachField`가 DS에 생겨 다른 화면도 같은 첨부 UI를 쓸 수 있다.

**감수하는 것 / 후속 확인 필요**

- **사진이 붙은 제보는 Slack 알림이 뜨지 않는다.** 맥락이 가장 풍부한 제보가 실시간으로 눈에 띄지 않게 되므로, 운영에서는 admin-v2 `/report-logs`를 주기적으로 확인해야 한다. 알림을 되찾으려면 (a) 백엔드가 `meta`를 저장하도록 하거나 (b) 사진 없는 요약본을 별도로 한 번 더 보내는 방법이 있다 — 후자는 리포트가 두 건으로 쪼개져 보류했다.

- **저장 항목 크기 상한이 미검증이다.** 5장 첨부 시 1MB에 근접하는데, 저장소가 DynamoDB라면 항목당 400KB 제한에 걸릴 수 있다. 걸리면 장수를 줄이거나 압축을 더 하거나, 결국 업로드 API로 옮겨야 한다.
- Figma의 `서버 스펙 구현이후 연동` 주석은 유효한 경고였다 — `meta` 미저장이 그 실체였고, 남은 것은 크기 상한이다.
- 사진은 사용자가 직접 고른 화면 캡처라 **개인정보가 담길 수 있다.** 리포트는 공용 Slack 채널·관리자 콘솔로 가므로, 취급 정책은 텍스트 본문과 같은 수준으로 다룬다(별도 스크러빙 없음 — ADR-0047의 로그 스크러빙 보류와 동일한 입장).
