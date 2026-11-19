> English: 패키지의 `AGENTS.md`(이 파일 옆의 `agent-rules.md`) — 영어판이 정본입니다. 두 판이 다르면 영어판을 따르세요.

# Chatic 앱을 작성하는 AI 어시스턴트를 위한 규칙

지금 `@lemoncloud/chatic-apps-sdk`를 사용해, DoU 앱 안에서 `https://<name>.apps.chatic.io`로 열리는 웹
페이지를 작성한다. 다음 규칙을 따른다. 이 패키지의 `GUIDE.md`는 프로젝트를 구성하는 방법과 번들의 모양을
설명하고, `README.md`는 모든 호출, 제한, 오류 코드의 레퍼런스다. 그 내용에 의존하는 코드를 쓰기 전에
필요한 부분을 읽는다.

## 프로젝트

1. **정적 파일만 쓴다.** 결과물은 최상위에 `index.html`이 있고 그 옆에 `.well-known/chatic-app.json`이 있는
   폴더다. 서버 코드, 서버 사이드 렌더링, 서버 라우팅을 쓰지 않는다.
   Vite에서는 매니페스트를 `public/.well-known/chatic-app.json`에 둔다.
2. **페이지는 항상 `/`로 진입한다.** 경로로 라우팅하지 않고 `base`를 설정하지 않는다. 공유 링크는 데이터를
   쿼리에 담는다. 페이지가 시작할 때 `location.search`에서 읽는다.
3. **mock은 개발 중에만, `connect()` 전에 설치한다**:
   `if (import.meta.env.DEV) installChaticAppsMock({ permissions: [...] })`, 가져오는 곳은
   `@lemoncloud/chatic-apps-sdk/mock`이다.

## 호출

4. `@lemoncloud/chatic-apps-sdk`를 사용한다. 시작할 때 `try/catch` 안에서 `await connect()`를 한 번 호출한다.
5. 앱 기능을 제공하기 전에 `apps.inApp`과 `apps.supports(capability)`를 확인한다. 버전 번호를 비교하지
   않는다.
6. 모든 호출은 `ChaticAppsError`를 던질 수 있다. `error.code`로만 분기하고, `error.message`로 분기하지 않는다.
7. 테마와 언어는 OS가 아니라 `apps.context`와 `apps.onContextChange`에서 가져온다.
8. 공유 링크는 `apps.link({ ... })`로 만든 것을 쓰고, 페이지 자체의 주소를 쓰지 않는다.
9. 페이지의 상태는 바뀔 때마다, 늦어도 `visibilitychange`가 `hidden`이 될 때 `apps.storage`에 저장한다.
   `localStorage`에는 절대 저장하지 않는다. 다른 휴대폰으로 사용자를 따라가야 하는 것은
   직접 운영하는 서버에 `apps.getUserKey()`로 받은 키로 구분해 둔다.
10. 페이지 안의 화면과 대화상자는 스택으로 관리한다. 스택에 화면이 둘 이상인 동안은
    `apps.onBack(back)`, 루트에서는 `apps.onBack(null)`로 두어 Android 뒤로 가기가 페이지를 닫게 한다. iOS에는
    뒤로 가기 키가 없으므로, 돌아갈 화면이 있을 때마다 같은 `back()`을 호출하는 뒤로 가기 버튼을 그린다.
    스택은 메모리에 둔다. 브라우저 히스토리를 push하는 라우터(해시 라우트, `pushState`)를 쓰면 루트에서
    Android 뒤로 가기가 페이지를 닫는 대신 그 히스토리를 거슬러 간다.
11. `apps.onCloseRequest`는 저장하지 않은 작업을 보호할 때만 쓴다. 닫으려면 `true`를 반환한다.
12. 카메라나 마이크는 사용자가 그 기능을 쓰려 할 때 `apps.permissions.request(kind)`를 호출하고 — 시작할 때
    호출하지 않는다 — 그다음 `getUserMedia`를 호출한다. 매니페스트 권한은 필요 없다. 요청에 타임아웃을 두지
    않고, 응답이 `'blocked'`이면 `apps.openSettings()`를 호출해 사용자를 설정 화면으로 안내한다. `query`의 응답이 아니라 요청의 응답을 사실로
    취급한다. Android에서 `query`는 차단된 권한을 `'prompt'`로 읽을 수 있다.

13. 앱의 데이터는 `apps.data`로만, 그리고 `apps.supports('data')` 확인 후에만 읽는다. 먼저
    `apps.data.connect()`를 호출하고 `CONSENT_REFUSED`(페이지가 왜 데이터가 필요한지 보여준다)와
    `CLOUD_CHANGED`(페이지를 끝내거나 안내를 보여준다. 재시도하지 않는다)를 처리한다. 메서드는
    `DataCalls`와 `DataStreams`에 타입으로 정의된 이름으로 호출하고 인자는 타입이 검사하게 한다. 응답을
    `any`로 캐스트하지 않고, 타입이 있는 메서드에 직접 만든 타입으로 `call<T>`를 넘기지 않으며, 메서드 이름을
    지어내지 않는다 — 앱이 열지 않는 메서드는 `RUNTIME_NOT_ALLOWED`로 실패한다. 타입이 있는 스트림에는 그
    인자만 넘기고, `LISTENER`를 넣지 않고 리스너 뒤에도 아무것도 넘기지 않으며, 화면에서 사라지면 `stop()`한다.
    모든 행 필드는 대체값과 함께 읽는다. 대부분 선택적이다. 메시지는 `chatSend`를 갖춘 상태에서
    `apps.data.sendMessage(channelId, text)`로만, 사용자가 보내기로 고른 텍스트만 보낸다 — 사용자의 이름으로
    나간다. 페이지가 있는 클라우드는 `cloud.cacheRead`가 아니라
    `call('cloud.getCloud', { id }, { cache: false })`로 읽는다. `cloud.cacheRead`는 사용자가 소유한
    클라우드에 대해 자주 `null`이다. `id`는 세션의 `context.cloud.cloudId`(`session` 필요) 또는
    `params.cloud.id`에서 가져온다. 행에는 연락처와 계정 정보(이메일, 전화번호, 로그인 id, 계정 번호)가
    담겨 있다. 페이지에 필요한 필드만 보여 주거나 저장하고, 기기 밖으로 절대 보내지 않는다.
    mock에서는 지어낸 id와 이름으로 타입에 맞는 응답을 준다.

## 페이지

14. `window.opener`, 팝업 로그인, 파일 다운로드를 쓰지 않는다.
15. 오류나 `reportError`에 사용자의 데이터를 절대 넣지 않는다.
16. 페이지에 필요한 권한(`clipboard`, `share`, `openUrl`, `userKey`, 그리고 앱의 데이터를 위한 `session`,
    `cloud`, `place`, `channel`, `chat`, `user`, 보내기를 위한 `chatSend`)을
    `/.well-known/chatic-app.json`에 나열한다 — 쓰지 않는 것은 나열하지 않는다. 권한이 필요한 호출은 그 권한
    없이는 `NOT_SUPPORTED`로 실패하고, 클라우드 데이터 권한이 여는 범위 밖의 클라우드 데이터 메서드는
    `RUNTIME_NOT_ALLOWED`로 실패한다.
17. 안전 영역을 위해 그리지 않는다. 페이지는 이미 모든 가장자리에서 안전 영역 안에 놓인다. 예외는 화면
    가장자리까지 장면이 닿아야 하는 페이지를 위한 `"display": "immersive"` 매니페스트다. 이때는 viewport
    meta에 `viewport-fit=cover`를 추가하고, 모든 헤더, 컨트롤, 탭 가능한 요소에
    `var(--chatic-safe-area-inset-<edge>, env(safe-area-inset-<edge>, 0px))`로 여백을 준다.
18. 매니페스트가 `"display": "titled"`를 설정하지 않는 한 페이지에는 제목 바가 없다. 자기 헤더와 제목을
    그리고, 앱의 닫기 버튼이 떠 있는 오른쪽 위 모서리를 비워 둔다.

## 다 됐다고 말하기 전에

빌드를 실행하고, `dist/index.html`과 `dist/.well-known/chatic-app.json`이 있는지 확인한다. 확인하지 못한 것을
말한다. mock을 쓴 브라우저는 페이지의 로직을 증명할 뿐 휴대폰에 대해서는 아무것도 증명하지 않는다 —
레이아웃, 키보드, 실제 햅틱은 앱이 있어야 확인할 수 있다.
