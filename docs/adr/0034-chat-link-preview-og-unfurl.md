# ADR-0034: 채팅 링크 프리뷰 — 모바일 셸 og unfurl, 이미지는 원격 로드

> 상태: Accepted · 결정일: 2026-07-31 · 구현 갱신: 2026-08-01 (결정 2·9 — 각 항목 아래 노트 참고)
>
> 구현된 모습은 [chat-link-preview.md](../chat-link-preview.md)에 있다. 이 문서는 히스토리이므로 원 결정문을 고치지 않고, 구현이 결정과 갈라진 두 곳에만 노트를 덧붙였다.

## 맥락 (Context)

- `apps/web`의 채팅방(`ChannelRoomPage`)에는 **URL 링크화가 아예 없다.** 버블은 content를 생문자열로 렌더하고(`ChannelMessageRow.tsx:214`, `MessageBubble.tsx:44`), 200자를 넘으면 잘라낸 뒤 확장 다이얼로그에서 전문을 보여준다. 사용자는 채팅에 붙은 링크를 탭할 수조차 없다. og 프리뷰는 당연히 없다.
- **데스크톱에는 같은 기능이 이미 전부 있다.** Electron main process의 `apps/desktop/src/main/unfurl.ts`(SSRF 가드·3초 타임아웃·256KB 캡·og 추출), `apps/desktop-web/.../LinkPreviewCard.tsx`(모듈 레벨 캐시), `RichText.tsx`(링크화).
- **브릿지 계약도 이미 공유 라이브러리에 있다.** `libs/app-messages/src/types/model/unfurl.ts`의 `FetchUrlMetadata` / `OnFetchUrlMetadata`가 `WEB_MESSAGE_RESPONSE_TYPE`(`web-message-response.ts:43`)에 등록되어 있다. 비어 있는 것은 **모바일 셸의 핸들러 구현 하나뿐**이다.
- **초기 가설은 사실이 아니었다.** "CORS 때문에 웹뷰가 외부 og 이미지를 못 띄우니 네이티브가 이미지를 내려받아 저장해야 한다"고 보았으나, CORS는 `<img>` 같은 서브리소스 **로드**에 적용되지 않고 JS가 응답 **본문을 읽을 때**만 적용된다. 두 갈래가 정확히 반대다 — **이미지 표시는 웹에서 되고, HTML 파싱은 웹에서 안 된다.** 데스크톱이 이미 이 구조(main에서 파싱, 렌더러에서 원격 `<img>`)로 동작 중인 것이 그 증거다. `apps/web`에는 CSP도 설정되어 있지 않다.
- 제약: 백엔드(`chatic-socials-api` / socket 서버)는 이번 범위에서 건드리지 않는다.
- 제약: 메시지 wire 스키마가 닫혀 있다. `ChatSendRequestData`에 `attachments`/`meta`/`extra`가 없고 `content` + 자유 문자열 `contentType`뿐이라, 프리뷰 데이터를 메시지에 실어 보낼 수 없다. 렌더 시점 파생이 유일한 길이다.
- 제약: RN 0.83의 `fetch`는 XHR 기반이라 `response.body` 스트리밍 리더가 없다. 데스크톱 `unfurl.ts`의 `getReader()` 기반 256KB 캡을 **그대로 복사하면 항상 빈 본문을 읽는다.**
- 제약: 현재 캐시 스택(IndexedDB 핫 / 네이티브 SQLite 콜드)은 도메인 레코드 전용이다. `CacheType`이 닫힌 유니온이고 타입마다 SQLite 테이블이 1:1로 대응한다. 바이너리를 담는 계층도, 서비스워커도 없다.

## 결정 (Decision)

1. **og 파싱은 모바일 셸에서 한다.** 기존 `FetchUrlMetadata` 계약을 그대로 재사용한다 — 신규 계약이 없으므로 `BRIDGE_VERSION` bump도 없다. `useWebMessageRouter`의 3개 등록 지점 + 도메인 훅 하나를 추가한다.
2. **구현은 TS 레벨로 하고 네이티브 모듈(Kotlin/Swift)은 추가하지 않는다.** 이미 의존성에 있는 `axios`의 `onDownloadProgress` + `AbortController`로 바이트 캡을 건다. 데스크톱의 보안 가드는 규칙 그대로 이식한다: http(s) 한정, 사설/루프백/링크로컬 호스트 차단, **리다이렉트 종착지 재검사**, 3초 타임아웃, HTML content-type 검사, og 우선 → `<title>`/`description` 폴백.

    > **[2026-08-01 구현 갱신] 전송 수단을 `axios` → raw `XMLHttpRequest`로 바꿨다.** 결정의 실질("TS 레벨, 네이티브 모듈 없음, 가드 규칙 전부 이식")과 가드 목록은 그대로 지켰고, 바이트를 세는 계층만 교체했다.
    >
    > 이유: **`axios`로 abort하면 그때까지 받은 본문까지 함께 버려진다.** 그러면 256KB를 넘는 페이지(대형 뉴스·커머스는 흔하다)는 og가 `<head>`에 멀쩡히 있어도 프리뷰가 아예 안 나온다. raw XHR은 `progress`에서 `responseText`를 스냅샷한 뒤 abort할 수 있어 부분 본문을 살리고, 덤으로 `readyState === 2`에서 `content-type`과 `responseURL`을 검사해 **본문을 받기 전에** 끊을 수 있다. 즉 결정 2가 요구한 가드 셋이 전부 제자리에 들어간다.
    >
    > 리스크는 비대칭이다. RN이 `progress` 중 증분 텍스트를 주지 않으면 스냅샷이 빈 문자열이 되어 "대용량 페이지 프리뷰 실패", 즉 **이 결정이 원래 받아들였던 axios 동작과 정확히 같은 상태로 degrade**한다. 상한만 있고 하한은 없다. 실기기 확인은 아직 남아 있다.
    >
    > 구현 중 추가로 드러난 것: **RN의 `URL` 전역은 `href`/`toString()`만 있는 스텁이라 `hostname`을 노출하지 않는다.** 그래서 호스트 가드가 표준 `URL`에 의존할 수 없어 정규식 스플리터(`parseUrl`)를 직접 뒀다. 그 과정에서 `isPrivateHost`를 deny-by-default로 뒤집어, 데스크톱 판이 통과시키던 대체 IP 표기(`http://2130706433/`, `http://0x7f000001/`)와 단일 라벨 사내 호스트(`http://wiki/`)까지 막았다.

3. **이미지는 저장하지 않는다.** https `imageUrl`만 응답에 실어 웹이 `<img src>`로 직접 로드한다(데스크톱과 동일). 바이너리는 브릿지로 보내지 않는다. 핫링크 차단 완화와 referrer 유출 축소를 위해 `referrerPolicy="no-referrer"`를 적용한다. http 이미지는 mixed content로 차단되므로 https만 통과시킨다.
4. **캐시는 세션 메모리만 둔다.** 데스크톱과 동일하게 모듈 레벨 `Map`(500개 상한, 실패도 `null`로 캐싱, in-flight 중복 제거). SQLite 영속화는 하지 않는다.
5. **프리뷰 카드는 메시지당 첫 URL 하나에만 붙인다.** (Slack·데스크톱과 동일)
6. **링크화도 이번 범위에 포함하되 URL만 대상으로 한다.** desktop-web `RichText`의 볼드/이탤릭/취소선/멘션 문법은 이식하지 않는다. 탭 시 `isNative()`면 `appBridge.openURL`로 외부 브라우저를, 아니면 새 창을 연다 — `apps/web`에 이미 자리잡은 관례다.
7. **프리뷰 대상 URL은 전문(`content`)에서 찾고, 링크화는 실제 렌더되는 문자열에 적용한다.** 200자 경계에 걸려 잘린 URL은 링크화하지 않는다(잘못된 주소로 이동하는 것을 막기 위해). 확장 다이얼로그의 전문에도 같은 링크화를 적용한다.
8. **순수 브라우저에서는 프리뷰 카드를 렌더하지 않는다.** `isNative()`가 false면 조용히 생략한다 — 셸 없이는 파싱 자체가 불가능하다. 링크화는 브라우저에서도 동작한다.
9. **로직은 공유하고 UI는 앱별로 둔다.** unfurl 요청/캐시 로직과 URL 추출 정규식은 공유 위치로 올리고, 카드 컴포넌트는 각 앱이 자기 디자인으로 갖는다. `apps/desktop-web`은 `libs/web-ui-kit`을 한 곳도 쓰지 않는 독립 클라이언트이므로 UI를 강제로 합치지 않는다.

    > **[2026-08-01 구현 갱신] 공유 위치로 올리지 않았다. unfurl 요청/캐시와 URL 정규식은 `apps/web/features/channels` 안에 있다.**
    >
    > **전제가 바뀌었다.** 이 결정은 웹측 소비자가 `apps/web`과 `apps/desktop-web` 둘이라는 가정에서 나왔는데, 착수 시점에 **데스크톱(`apps/desktop`·`apps/desktop-web`)이 작업 범위에서 제외**되었다. 소비자가 하나뿐인 코드를 `libs/shared`로 올리면 공유가 아니라 우회로가 된다 — 호출자는 한 곳인데 정의만 멀어진다.
    >
    > 되돌리기 비용은 낮게 유지했다. `tokenizeLinks`/`extractFirstUrl`은 순수 함수고 `requestUrlMetadata`는 모듈 레벨 `Map` 하나에 얹힌 함수 하나이므로, 둘째 소비자가 생기는 시점에 `libs/shared`로 그대로 옮기면 된다. 그때 `apps/desktop-web`의 `LinkPreviewCard`에 갇혀 있는 같은 로직도 함께 정리한다.
    >
    > **결정의 절반("UI는 앱별로")은 유지되되 자리가 달라졌다.** 표현 전용 카드는 `libs/web-ui-kit/composites/chat/LinkPreviewCard.tsx`에 있는데, 이는 공유가 아니라 이 리포의 UI 레이어링 관례다 — `web-ui-kit`은 `apps/web` 전용이고 `MessageRow`·`ReadReceipt`·`SystemNotice`가 모두 거기 있다. 데이터·브릿지·플랫폼 분기는 `apps/web`의 `MessageLinkPreview`가 갖는다.
    >
    > 아래 "제외(후속 작업)"에 있던 **"데스크톱 `unfurl.ts`와의 구현 통합"은 후속 과제가 아니라 아예 무관한 항목이 되었다.** 모바일 셸의 og fetcher는 데스크톱 `unfurl.ts`의 가드 규칙을 참고하되 코드를 공유하지 않는 별개 구현이다.

**포함:** 모바일 셸 `FetchUrlMetadata` 핸들러(og fetcher + SSRF 가드 + 바이트 캡), `apps/web` URL 링크화, 프리뷰 카드 컴포넌트, unfurl 요청/캐시 로직의 공유 위치 이관, 링크 탭 시 외부 브라우저 열기.

**제외(후속 작업):** 백엔드 unfurl 엔드포인트, og 메타 영속 캐시, 이미지 프록시, 이미지 메시지(첨부) 기능 일반, `RichText`의 마크다운 서식, 데스크톱 `unfurl.ts`와의 구현 통합.

## 대안 (Alternatives)

- **백엔드 unfurl 엔드포인트** — 보류. 서버가 한 번 fetch해 결과를 공유 캐시하면 웹/모바일/데스크톱이 한 경로로 통일되고 사용자별 중복 fetch와 IP 노출이 함께 사라진다. 기술적으로 가장 깨끗하지만 이번 사이클에서 백엔드를 건드리지 않기로 했다. 결정 4의 `requestMetadata()` 함수 하나만 교체하면 이 경로로 갈아탈 수 있게 남겨 둔다.
- **네이티브가 og 이미지를 내려받아 로컬 저장 후 웹에 노출** — 폐기. CORS 오해에서 출발한 안이었고, 전제가 무너지자 남는 이득이 없다. 실행하려면 `FileManagerBridge.downloadFile` + 로컬 정적 서버(현재 debug 전용)라는 새 계층을 세워야 하는데, 정작 이미지 바이트는 웹뷰 HTTP 캐시(`cacheEnabled` + `LOAD_DEFAULT`)가 이미 받아주고 있다.
- **og 메타를 네이티브 SQLite에 영속화** — 폐기. `CacheType` 유니온 + 신규 테이블 + 마이그레이션 + 어댑터 배선이 전부 따라온다. 반면 프리뷰 요청은 실제로 렌더된 메시지에 대해서만 발생해 앱 재시작당 수 건 수준이고, 되돌리기 비용이 비대칭이다(메모리 캐시는 함수 교체로 끝, 스키마는 마이그레이션이 영구히 남는다).
- **기존 `meta` 테이블에 끼워넣기** — 폐기. `meta`는 `{cid, uid}` 스코프라 클라우드·유저 조합마다 같은 URL의 메타가 중복 저장된다. unfurl 결과는 원래 유저 무관한 전역 데이터라 개념이 어긋난다.
- **네이티브 모듈(Kotlin/Swift)로 파싱** — 폐기. HTTP GET + 정규식 추출뿐이라 OS API가 필요 없고, 플랫폼 두 벌을 짜고 유지할 이유가 없다. `axios`로 충분하다.
- **desktop-web `RichText` 전체 이식** — 보류. 마크다운 서식은 별개 제품 결정이고, 링크 프리뷰에 얹어 슬쩍 들여올 사안이 아니다.
- **프리뷰 카드를 공유 컴포넌트로 승격** — 폐기. desktop-web은 `web-ui-kit`을 전혀 사용하지 않는 독립 클라이언트이고(CONTEXT.md의 "Desktop Web" 정의), 레이아웃 요구도 다르다. 로직만 공유한다.

## 결과 (Consequences)

- **얻는 것:**
    - 채팅 링크를 탭할 수 있게 된다. 프리뷰보다 이쪽이 즉각적 가치가 크다.
    - 신규 브릿지 계약이 없어 `BRIDGE_VERSION` bump와 그에 딸린 스큐 관리가 없다.
    - 구버전 셸에서도 안전하다. 핸들러가 없으면 `AppBridgeHost`가 `NOT_FOUND`를 돌려주고 카드가 조용히 렌더되지 않는다(Capability Skew가 이미 처리된 경로).
    - 스키마 변경과 마이그레이션이 없다.
- **감수하는 것:**
    - **웹뷰가 외부 도메인에 직접 이미지를 요청하므로 사용자 IP가 그 사이트에 노출된다.** 악의적 링크를 채널에 뿌리면 트래킹 픽셀로 쓸 수 있다. 데스크톱이 이미 감수 중인 리스크와 동일하며, 해소하려면 이미지 프록시(사실상 백엔드 경로)가 필요하다.
    - 같은 링크를 채널 멤버가 각자 fetch한다. 공유 캐시가 없으므로 인기 링크는 N번 조회된다.
    - 앱 재시작 시 화면에 보이는 링크들을 다시 unfurl한다.
    - 순수 브라우저 접속에서는 프리뷰가 보이지 않는다.
    - **바이트 캡 구현이 데스크톱(스트리밍 리더)과 모바일(axios progress)로 갈라져 두 벌을 유지하게 된다.** og 추출 규칙 자체는 공유 가능하나 전송 계층은 분리된다.
- **알려진 인접 결함(이번 범위 밖, 접촉 시 주의):** `ChannelRoomPage.tsx:242`의 재전송 경로가 `contentType`을 누락한 채 content만 다시 보낸다. desktop-web은 같은 버그를 공유 `toSendPayload`로 고쳤다. 텍스트 외 `contentType`이 `apps/web`에 도달하는 순간 문제가 된다.
