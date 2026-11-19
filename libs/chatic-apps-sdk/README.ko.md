> English: [README.md](./README.md) — 영어판이 정본입니다. 두 판이 다르면 영어판을 따르세요.

# chatic-apps-sdk

DoU 앱 안에서 실행되는 페이지를 만든다. `https://<name>.apps.chatic.io`의 페이지는 앱에서 다른 모든 화면
위에 열리고, 이 라이브러리로 앱과 통신한다. 스스로 닫으면서 결과를 돌려주고, 앱의 바에 제목을 달고(페이지가
바를 요청한 경우), 햅틱을 울리고, 공유하고, 복사하고, 링크를 앱 밖에서 열고, 자기 데이터를 기기에 보관하고,
서버에 사용자의 데이터를 보관할 키를 받고, Android 뒤로 가기 버튼을 가로채고, 사용자가 닫기 전에 물어볼 수
있다. 사용자는 앱에서만 페이지에 들어온다 — 페이지 링크는 브라우저에서 페이지를 열지 않는다 — 하지만 개발하는
동안에는 같은 페이지가 일반 브라우저 탭에서도 실행되고, 그때 라이브러리는 브라우저가 할 수 있는 방식으로
대신한다.

`@lemoncloud/chatic-apps-sdk`로 배포된다. 런타임 의존성은 없다. 패키지의 `GUIDE.md`는 프로젝트를 설정하는 법과
번들의 모양을 설명하고, `AGENTS.md`는 페이지를 작성하는 AI 어시스턴트가 따를 규칙을 담고 있다.

## 설치

```bash
npm install @lemoncloud/chatic-apps-sdk
```

번들러 없이 쓰려면 `window.ChaticAppsSDK`를 정의하는 스크립트 하나를 넣는다(버전을 고정할 것. 아래의 mock은 이
파일에 들어 있지 않다):

```html
<script src="https://unpkg.com/@lemoncloud/chatic-apps-sdk@0.2.0/chatic-apps-sdk.global.js"></script>
```

## 시작

```ts
import { connect, ChaticAppsError } from '@lemoncloud/chatic-apps-sdk';

try {
    const apps = await connect();
    document.documentElement.dataset.theme = apps.context?.theme ?? 'light';
} catch (error) {
    // `UNSUPPORTED_PROTOCOL`: the app is newer than this library — update the library, and tell the
    // user this page needs an update. `TIMEOUT`: the app did not answer (see "Rules worth knowing").
}
```

페이지가 시작될 때 `connect()`를 호출한다. 앱에서는 앱의 응답을 기다리고(몇 밀리초), 브라우저에서는 바로
반환한다. 다시 호출하면 같은 연결을 돌려주므로 페이지의 어느 부분에서든 호출해도 된다. 아래의 모든 것은 이
함수가 반환하는 객체의 메서드다.

## 완성된 페이지

파일 하나, 빌드 단계 없음. `index.html`로 저장해 브라우저에서 열면 브라우저 대체 동작으로 실행되고, 자신의
`apps.chatic.io` 주소에 배포하면 앱에서 실행된다.

```html
<!doctype html>
<html lang="ko">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>Quiz</title>
        <script src="https://unpkg.com/@lemoncloud/chatic-apps-sdk@0.2.0/chatic-apps-sdk.global.js"></script>
    </head>
    <body>
        <h1 id="score">0</h1>
        <button id="plus">+1</button>
        <button id="share" hidden>Share</button>
        <button id="done">Done</button>
        <script type="module">
            const { connect } = window.ChaticAppsSDK;
            const apps = await connect();
            let score = 0;

            document.documentElement.dataset.theme = apps.context?.theme ?? 'light';
            apps.onContextChange(context => (document.documentElement.dataset.theme = context.theme));

            document.getElementById('plus').onclick = () => {
                score += 1;
                document.getElementById('score').textContent = String(score);
                apps.haptic('selection');
            };

            // Offer only what this app can do here.
            const share = document.getElementById('share');
            share.hidden = !(apps.supports('share') || !apps.inApp);
            share.onclick = () => apps.share({ message: `I scored ${score}`, url: apps.link({ score }) });

            document.getElementById('done').onclick = async () => {
                if (apps.inApp) await apps.finish({ score });
            };
        </script>
    </body>
</html>
```

## 페이지가 할 수 있는 일

| 호출                                                             | 앱에서                                                                                      | 브라우저에서                       | 필요한 권한                                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| `finish(result?)`                                                | 뷰를 닫는다. `result`(JSON, ≤ 16 KiB)는 페이지를 연 쪽으로 돌아간다                         | `NOT_IN_APP`                       | —                                                                             |
| `setTitle(title)`                                                | 페이지가 바를 요청했다면 앱의 바에 표시된다(1–100자)                                        | `document.title`                   | —                                                                             |
| `haptic(kind)`                                                   | `selection`, `impact`, `success`, `warning`, `error`                                        | 지원되면 짧은 진동                 | —                                                                             |
| `onBack(handler \| null)`                                        | Android 뒤로 가기가 `handler`를 호출하고 그 밖에는 아무것도 하지 않는다                     | 호출되지 않음                      | —                                                                             |
| `onCloseRequest(handler \| null)`                                | 사용자가 닫기 전에 묻는다. `true`를 반환하면 닫힌다                                         | 호출되지 않음                      | —                                                                             |
| `reportError(error)`                                             | DoU의 로그에 자신의 origin으로 기록된다(페이지 로드당 20개)                                 | `console.error`                    | —                                                                             |
| `copy(text)`                                                     | 클립보드                                                                                    | 브라우저의 클립보드                | `clipboard`                                                                   |
| `share({ title, message, url })`                                 | 공유 시트. 사용자를 기다린다(아래 참고)                                                     | Web Share, 없으면 복사(`'copied'`) | `share`                                                                       |
| `openUrl(url)`                                                   | 브라우저, 메일, 전화, SMS 또는 스토어                                                       | 새 탭                              | `openUrl`                                                                     |
| `getUserKey()`                                                   | 16진수 64자. 이 기기와 이 사이트에서 항상 같다                                              | `NOT_IN_APP`                       | `userKey`                                                                     |
| `link(params?)`                                                  | 이 페이지를 앱에서 여는 링크(아래 참고)                                                     | 페이지 자신의 루트                 | —                                                                             |
| `storage.get(key)`, `.set(key, value)`, …                        | 기기에 있는 페이지 전용 저장소(아래 참고)                                                   | `localStorage`, 한도 동일          | —                                                                             |
| `permissions.query(kind)`, `.request(kind)`, `openSettings()`    | `'camera'` 또는 `'microphone'`에 대해 앱이 OS에서 받은 권한 상태와, 그 권한 요청(아래 참고) | 브라우저 자체의 권한               | —                                                                             |
| `data.connect()`, `.call(…)`, `.subscribe(…)`, `.sendMessage(…)` | 앱 자신의 데이터 — 현재 클라우드 — 를 DoU 화면처럼 읽는다. `chatSend`로 텍스트를 보낸다     | `NOT_IN_APP`                       | `session`, `cloud`, `place`, `channel`, `chat`, `user`; 보내기에는 `chatSend` |

그 밖에 `apps.context`(앱의 언어, 테마, 플랫폼 — `ios`, `android` 또는 `desktop` — 그리고 페이지를 열 때
전달된 `params`. DoU 자체 웹은 미니앱을 `MiniAppLaunchParams`로 연다. 아래 참고), 테마나 언어 변경을 듣는
`apps.onContextChange(listener)`, `apps.supports(capability)`, `apps.inApp`, `apps.disconnect()`가 있다.

- **`share`**는 iOS에서 `'shared'` 또는 `'dismissed'`로 resolve된다. Android에서는 선택 창이 열리는 즉시, 사용자가
  그 뒤 무엇을 하든 `'shared'`로 resolve된다. 공백이 아닌 `message` 또는 `url`이 필요하고, `url`은 `http(s)`여야
  한다. `title`, `message`, `url`은 각각 최대 100자, 4,000자, 2,048자다.
- **`link(params)`**는 링크에 실을 값을 객체로 받아, `link({ level: 3, seed: 7 })`에 대해
  `https://app.chatic.io/apps/<app id>?level=3&seed=7`을 준다. 탭하면 앱에서 페이지가 그 쿼리와 함께 **루트에서**
  열린다 — `location.search`에서 읽는다. 링크는 경로도 프래그먼트도 싣지 않는다. 앱이 설치되지 않은 곳에서는
  탭하면 앱의 스토어 페이지를 보여 주며, 브라우저에서 페이지를 열지는 않는다. app id는 페이지가 등록된 id이고
  서브도메인과 다를 수 있으므로, 링크를 손으로 쓰지 않는다. 브라우저나 페이지 링크가 생기기 전의 앱에서는 같은
  쿼리를 단 페이지 자신의 루트를 준다.
- **`storage`**는 자신의 사이트만을 위해 기기에 JSON을 보관한다: `get(key)`, `getMany(keys)`, `set(key, value)`,
  `setMany(entries)`(전부 아니면 전무), `remove(key or keys)`, `keys()`, `clear()`, `usage()`. 앱 재실행과
  로그아웃 후에도 남고 앱을 삭제하면 사라진다. 사용자가 다른 휴대폰으로 옮겨도 따라가지 않는다. 사이트당 모두
  합쳐 1,048,576자(키와 JSON으로 된 값)를 쓸 수 있고 — 넘으면 쓰기가 `QUOTA_EXCEEDED`로 실패하고 아무것도
  바뀌지 않는다 — 키는 1–200자(`__proto__` 제외), 한 번의 호출은 최대 64 KiB(`TOO_LARGE`)다. 값 하나는 한 번의
  호출로 쓰이므로 값 하나는 64 KiB 미만이어야 한다. 그보다 큰 것은 여러 키로 나눈다.
- **`permissions`**는 카메라와 마이크용이며, 페이지는 이를 브라우저 자체의 `getUserMedia`로 사용한다 — OS가
  처음에 DoU의 이름으로 사용자에게 묻기 때문에 사용자의 답은 이 페이지만이 아니라 모든 페이지에 적용된다.
  `query(kind)`는 아무것도 보여 주지 않고 `'granted'`, `'prompt'`(아직 묻지 않았거나, 거부되었지만 다시 물을 수
  있음) 또는 `'blocked'`(OS가 더 이상 묻지 않음)를 알려 준다 — Android에서는 OS가 더 이상 묻지 않는 권한도
  `'prompt'`로 읽힐 수 있으므로 `request`의 답을 믿는다. `request(kind)`는 권한 요청 창을 띄우고 그 답으로
  resolve된다. `openSettings()`는 OS 설정에서 DoU의 페이지를 열며, `'blocked'`에서 벗어나는 유일한 방법이다. 시작할 때가
  아니라 사용자가 기능을 쓰려 할 때 묻고, `request`에 타임아웃을 걸지 않는다: 사용자를 기다리기 때문이다.
  페이지는 이 모든 것을 건너뛰고 `getUserMedia`를 호출할 수도 있다. 그러면 캡처 도중에 권한 요청 창을 만난다.
  브라우저에서는 같은 호출이 브라우저 자체의 권한을 읽고 요청하며, `openSettings()`는 `NOT_IN_APP`이다.
- **잡히지 않은 오류는 자동으로 보고된다.** `connect()`는 `error`와 `unhandledrejection`을 듣고 DoU의 로그로
  보낸다. `Error`는 메시지와 스택을, 문자열은 그 자체를, 그 밖의 것은 타입만 보낸다. 끄려면
  `connect({ reportErrors: false })`를 넘긴다.

## 앱의 데이터 읽기: `apps.data`

페이지는 자신이 열린 클라우드 — 그 플레이스, 채팅방, 메시지, 멤버 — 를 DoU 자체 화면이 하는 것과 같은 읽기로
읽고, 변경을 듣고, 텍스트 메시지를 보낼 수 있다:

```ts
const apps = await connect();
const placeId = (apps.context?.params as Partial<MiniAppLaunchParams> | undefined)?.place?.id;
if (apps.supports('data') && placeId) {
    const { allowed } = await apps.data.connect(); // the app asks the user once, here
    const rooms = await apps.data.call('channel.cacheReadList', { sid: placeId });
    // rooms: CloudList<CloudChannel> | null
    const stream = await apps.data.subscribe('channel.observeList', [{ sid: placeId }], result => {
        render(result?.list ?? []);
    });
    apps.data.onCloudChanged(() => apps.finish());
}
```

- **앱 자신의 이름으로 타입이 붙는다.** 앱이 페이지에 여는 모든 메서드는 앱의 `<repository>.<method>` 이름으로,
  인자와 응답과 함께 `DataCalls` 또는 `DataStreams`에 있다. 잘못된 인자나 잘못 쓴 응답은 타입 검사에서 실패한다.
  라이브러리가 모르는 이름도 그대로 전달되고 `unknown`으로 응답한다 — 이 라이브러리보다 새로운 앱은 더 많은
  메서드를 열 수 있다. 타입을 명시한 `call<T>(name)`은 타입이 생기기 전처럼 여전히 어떤 메서드든 타입 없이
  호출한다.
- **돌아오는 것은 앱 자신의 데이터다.** 앱이 가진 그대로 — 아래 행들, 필드 하나하나 그대로 — 이며, 페이지를
  위해 모양을 바꾸거나 걸러 내지 않는다. `SDK_DATA_CONTRACTS`는 이 라이브러리가 지원하는 클라우드 데이터 계약
  버전을 나열한다.
- **읽기, 그리고 쓰기 하나는 매니페스트가 요청한 만큼만.** 클라우드 데이터 권한 하나하나가 정해진 메서드 집합을
  연다(아래 표). `connect()`는 이 페이지가 쓸 수 있는 이름들(`allowed.calls`, `allowed.streams`)을 응답하고,
  `can(name)`은 하나를 확인한다 — 타입은 메서드가 무엇인지 말하고, `can`은 그것이 지금 열려 있는지 말한다. 그
  밖의 것은 `RUNTIME_NOT_ALLOWED`로 거부된다. `chatSend`가 여는 메시지 하나를 빼면, 페이지가 호출할 수 있는 어떤
  것도 무언가를 바꾸거나, 클라우드나 플레이스를 전환하거나, 다른 클라우드를 읽지 않는다.
- **사용자에게 한 번 묻는다**, 페이지가 이 클라우드를 읽어도 되는지. `connect()`는 사용자가 얼마나 걸리든
  타임아웃 없이 답을 기다린다. 거부는 `CONSENT_REFUSED`이며, `connect()`는 다음에 페이지가 열릴 때 다시 묻는다.
- **스트림**: `subscribe(name, args, listener, onEnd)`는 각 이벤트를 `listener`에 넘긴다. 타입이 있는 스트림에는
  표에 있는 인자만 넘긴다: 라이브러리가 앱의 메서드가 콜백을 받는 자리, 곧 그 인자들 바로 뒤에 리스너를 넣는다.
  라이브러리가 모르는 이름에는 그 메서드가 콜백을 받는 자리에 `LISTENER`를 넣는다(생략하면 맨 끝에 간다).
  리스너 뒤에는 아무것도 넘기지 않는다. `onEnd`는 앱이 끝낸 스트림을 듣는다: `CLOUD_CHANGED`, 너무 큰 이벤트,
  또는 페이지가 back-forward 캐시에서 돌아온 뒤의 `DISCONNECTED`(다시 구독할 것). 페이지 로드당 최대 16개 —
  그다음 `subscribe`는 `INVALID`로 실패한다 — 이므로 더 이상 필요 없는 것은 각각 `stop()`한다.
- **클라우드는 고정이다.** 뷰가 열려 있는 동안 사용자의 클라우드가 바뀌면 모든 스트림이 `CLOUD_CHANGED`로
  끝나고, `onCloudChanged`가 한 번 발생하며, 그 뒤로는 아무것도 응답하지 않는다.
- **플레이스도 그렇다.** 플레이스에 속한 것 — 그 채팅방, 채팅방의 멤버와 메시지, 그 프로필 — 은 페이지가 열린
  플레이스에서만, 사용자가 아직 그곳에 있는 동안에만 읽힌다: 목록은 그 플레이스(`sid`)나 그 채팅방 하나를
  지정하고, 채팅방이나 메시지는 그 플레이스에 대해 확인된다. 그 밖의 것은 `RUNTIME_NOT_ALLOWED`이며, 사용자가
  다른 플레이스로 옮긴 뒤의 플레이스 읽기도 모두 그렇다. 그곳에서 새 뷰를 연다. 플레이스 자체(목록과 각 플레이스)와
  클라우드 자신의 행은 어느 플레이스에도 속하지 않으므로 계속 열려 있다. 플레이스 id는 `session().committedSiteId`나 실행
  파라미터(`place.id`)에서 읽는다.
- **서버 읽기에는 한도가 있다**: 뷰당 250 ms에 한 번, 1분에 60번이며, 넘으면 `error.details.retryAfterMs`와 함께
  `RATE_LIMITED`다.
- **일부 실행에서만 응답한다**: 앱이 세션을 직접 가지고 있어야 하고, 휴대폰에서 열린 것이어야 하고, 페이지는 심사를 거친 것이어야
  하고, 페이지가 열릴 때 클라우드 — 홈 포함 — 가 선택되어 있어야 하며, Android에서는 WebView가 페이지 자신의
  메시지와 그 안의 프레임이 보낸 메시지를 구분할 수 있어야 한다(오래된 Android System WebView는 구분하지 못하고,
  그때 앱은 그곳에서 `apps.data`에 전혀 응답하지 않는다). 그 밖의 모든 곳에서 `supports('data')`는 `false`이고,
  브라우저에서는 모든 호출이 `NOT_IN_APP`이다.
- **타입이 앱이 확인하는 인자를 모두 담을 수는 없다.** 변수로 넘긴 객체는 타입에 없는 필드를 가질 수 있고,
  `call<T>`는 인자 타입을 아예 건너뛴다. 앱은 여전히 자신의 검사가 거부하는 것(보내기의 추가 필드,
  `user.listPlaceMembers`의 `pageSize`)을 `RUNTIME_NOT_ALLOWED`로 거부한다.
- **앱이 가진 것을 읽는다.** 페이지가 호출하는 어떤 것도 앱의 캐시로 가져오지 않으므로, 페이지는 DoU가 이미
  동기화한 것과 아래에서 "server"로 표시된 메서드의 결과를 본다.

### 권한별 메서드

| 권한       | 메서드                                           | 인자                                                     | 응답                              |
| ---------- | ------------------------------------------------ | -------------------------------------------------------- | --------------------------------- |
| `session`  | — (hello의 응답: `session()`, `onSessionChange`) | —                                                        | `CloudSession`                    |
| `cloud`    | `cloud.cacheRead`                                | `id` — 현재 클라우드의 것                                | `CloudInfo \| null`               |
| `cloud`    | `cloud.getCloud` (server)                        | `{ id }` — 현재 클라우드의 것, `{ cache: false }`        | `CloudInfo`                       |
| `cloud`    | `cloud.observeItem` (stream)                     | `id` — 현재 클라우드의 것                                | `CloudInfo \| null`               |
| `place`    | `place.cacheReadList`                            | `{}` (선택)                                              | `CloudList<CloudPlace> \| null`   |
| `place`    | `place.observeList` (stream)                     | `{}`                                                     | `CloudList<CloudPlace> \| null`   |
| `place`    | `place.observeItem` (stream)                     | 플레이스 `id`                                            | `CloudPlace \| null`              |
| `place`    | `place.isPlaceDeleted` (server)                  | 플레이스 `id`                                            | `boolean`                         |
| `channel`  | `channel.cacheRead`                              | 채팅방 `id` — 그 플레이스의 채팅방                       | `CloudChannel \| null`            |
| `channel`  | `channel.cacheReadList`                          | `CloudChannelListQuery` — `sid`는 그 플레이스의 것, 필수 | `CloudList<CloudChannel> \| null` |
| `channel`  | `channel.fetchList` (server)                     | `CloudChannelListQuery` — `sid`는 그 플레이스의 것, 필수 | `CloudList<CloudChannel>`         |
| `channel`  | `channel.observeList` (stream)                   | `CloudChannelListQuery` — `sid`는 그 플레이스의 것, 필수 | `CloudList<CloudChannel> \| null` |
| `channel`  | `channel.observeItem` (stream)                   | 채팅방 `id` — 그 플레이스의 채팅방                       | `CloudChannel \| null`            |
| `channel`  | `join.cacheReadList`                             | `{ channelId, activeOnly? }` — 그 플레이스의 채팅방      | `CloudList<CloudJoin> \| null`    |
| `channel`  | `join.observeList` (stream)                      | `{ channelId, activeOnly? }` — 그 플레이스의 채팅방      | `CloudList<CloudJoin> \| null`    |
| `chat`     | `chat.cacheRead`                                 | 메시지 `id` — 채팅방이 그 플레이스의 것이면 응답         | `CloudChat \| null`               |
| `chat`     | `chat.cacheReadList`                             | `{ channelId, cursorNo?, limit? }`                       | `CloudList<CloudChat> \| null`    |
| `chat`     | `chat.listPendingImageChats`                     | 채팅방 `id`                                              | `CloudChat[]`                     |
| `chat`     | `chat.observeList` (stream)                      | `{ channelId, cursorNo?, limit?, includeUnsent? }`       | `CloudList<CloudChat> \| null`    |
| `chat`     | `chat.observeLastList` (stream)                  | 채팅방 id 목록                                           | `CloudLastChat[]`                 |
| `chat`     | `chat.observeFeedCoverage` (stream)              | 채팅방 `id`                                              | `[low, high][]` 메시지 번호 범위  |
| `user`     | `user.cacheReadList`                             | `{ channelId, limit?, page?, detail? }`                  | `CloudList<CloudUser> \| null`    |
| `user`     | `user.listPlaceMembers` (server)                 | `{ placeId, sessionPlaceId }` — 둘 다 현재 플레이스의 것 | `CloudPlaceMembers`               |
| `user`     | `user.observeList` (stream)                      | `{ channelId, limit?, page?, detail? }`                  | `CloudList<CloudUser> \| null`    |
| `user`     | `profile.cacheRead`                              | `<place id>@<user id>` — 그 플레이스의 것                | `CloudProfile \| null`            |
| `user`     | `profile.cacheReadList`                          | `{ sid, uid? }` — `sid`는 그 플레이스의 것, 필수         | `CloudList<CloudProfile> \| null` |
| `user`     | `profile.observeList` (stream)                   | `{ sid, uid? }` — `sid`는 그 플레이스의 것, 필수         | `CloudList<CloudProfile> \| null` |
| `user`     | `profile.observeItem` (stream)                   | `<place id>@<user id>` — 그 플레이스의 것                | `CloudProfile \| null`            |
| `chatSend` | `chat.sendChat` — `sendMessage`로 호출           | `{ channelId, content }`                                 | `CloudChat`                       |

### 행

모두 타입으로 export된다. 같은 행이 시간이 지나며 서로 다른 응답으로 채워지기 때문에 대부분의 필드는
선택(optional)이다: 필드는 서버나 앱이 채웠을 때만 있으므로, 각 필드를 대체값과 함께 읽는다.

| 타입           | 무엇인가                              | 알아 둘 필드                                                                                                                          |
| -------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `CloudChannel` | 채팅방                                | `id`, `sid` (그 플레이스), `name`, `stereo` (`dm`, `self`, …), `memberIds`, `chatNo`, `unreadCount`, `lastChat$`                      |
| `CloudJoin`    | 채팅방 안에서 멤버의 자리             | `channelId`, `userId`, `stereo` (`owner`, `member`), `readNo`, `nick`, `notify`                                                       |
| `CloudChat`    | 메시지                                | `id`, `channelId`, `chatNo` (보내는 중에는 `0`), `content`, `ownerId`, `createdAtMs` (항상 있음), `upload$$`, `isPending`, `isFailed` |
| `CloudPlace`   | 클라우드의 플레이스                   | `id`, `name`, `order`, `isOwner`, `owner$`                                                                                            |
| `CloudUser`    | 클라우드의 사용자                     | `id`, `name`, `nick`, `thumbnail`                                                                                                     |
| `CloudProfile` | 한 플레이스에서 사용자의 이름과 사진  | `id` (`<place>@<user>`), `sid`, `userId`, `nick`, `thumbnail`                                                                         |
| `CloudInfo`    | 현재 클라우드                         | `id`, `name`, `status`, `ownerId`, `cloudType`                                                                                        |
| `CloudSession` | 세션 중 현재 클라우드에 해당하는 부분 | `context.cloud.cloudId`, `context.identity.userId`, `committedSiteId`                                                                 |

`CloudList<Row>`는 `{ list, meta: { total, limit?, page?, cursorNo?, readNo?, source? } }`이다.

### 각 권한이 넘겨주는 것

앱은 페이지를 위해 행을 걸러 내지 않는다: DoU의 화면이 읽는 것을 페이지도 읽는다. 여기에는 연락처와 계정 정보가
포함되며, 타입에 그렇게 표시되어 있다. 페이지에 필요한 권한만 요청하고 — 읽은 것으로 무엇을 하는지는 작성자의
책임이다 — 그런 정보는 기기에 두며, 사용자에게 알리지 않고 제3자에게 보내지 않는다.

| 권한       | 넘겨주는 것                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session`  | 사용자가 있는 클라우드와 플레이스, 이 클라우드에서의 사용자 id, 로그인 여부. 사용자의 다른 클라우드에 관한 것, 서버 주소, 토큰은 없다                                                                                                                                                                                                                                                               |
| `cloud`    | 현재 클라우드의 행. 기기 캐시에서는 그 서버 주소(`backend`, `wss`)와 초대를 수락한 기기 사용자 id(`acceptedBy`)도. `cloud.getCloud`를 통해서는, 사용자가 소유한 클라우드라면 그 소유자, 인증된 **이메일**, 연결된 **계정**(`accountId`, `account$`), 구독 id, 클라우드 서버의 **계정 번호**(`accountNo`)와 서비스 엔드포인트(`$envs`). 그 밖의 클라우드라면 relay의 최소한의 `{ id, name, status }` |
| `place`    | 클라우드의 플레이스들과 그 서버 엔드포인트(`$envs`). 플레이스의 `owner$`는 계정 서버가 보는 그 소유자이며, 그 타입에는 **전화번호, 이메일, 주소, 생년월일**, 로그인 정보, 비밀 이름이 붙은 필드(`loginPw`, `$account.otp$`, `$account.key$`)가 있다 — 서버가 정하는 대로 채워진다. 비밀 이름이 붙은 필드는 절대 읽거나 보관하거나 보내지 않는다                                                     |
| `channel`  | 플레이스의 채팅방, 그 멤버 id, 각 멤버의 join(역할, 닉네임, 읽은 위치), 그리고 포함된 소유자(`owner$`, **로그인 id** 포함)                                                                                                                                                                                                                                                                          |
| `chat`     | 플레이스의 채팅방에 있는 메시지, 그 파일 주소, 웹훅 카드, 그리고 포함된 보낸 사람(`owner$`, **로그인 id** 포함)                                                                                                                                                                                                                                                                                     |
| `user`     | 플레이스의 채팅방에 있는 사용자(이름, 닉네임, 사진, **로그인 id**), 플레이스의 프로필, 그리고 그 멤버 목록                                                                                                                                                                                                                                                                                          |
| `chatSend` | 없음: 페이지가 보낼 수 있게 할 뿐이다                                                                                                                                                                                                                                                                                                                                                               |

### 메시지 보내기: `sendMessage`

```ts
const sent = await apps.data.sendMessage(roomId, 'Round 3: 120 points'); // CloudChat
```

`chatSend`가 있으면 `sendMessage(channelId, text)`는 `text`를 일반 텍스트로, 사용자의 이름으로, 아무 표시 없이,
페이지가 열릴 때 사용자가 있던 플레이스의 채팅방에 올리고, 보낸 메시지로 resolve된다. 이는
`call('chat.sendChat', { channelId, content: text })`이며, 이 호출도 여전히 동작한다. 텍스트만 — 첨부, 멘션,
답장 없음 — 최대 1,000자이고 공백 아닌 문자가 있어야 한다. 다른 플레이스의 채팅방, 사용자가 들어가 있지 않은
채팅방, 또는 사용자가 다른 플레이스로 옮긴 뒤의 모든 채팅방은 `RUNTIME_NOT_ALLOWED`로 거부된다. 사용자는 동의를
요청받을 때 페이지가 메시지를 보낸다는 것을 안내받으며, 플레이스마다 따로 요청받는다. 실패한 보내기는 DoU 자체
입력창에서 실패한 보내기처럼 사용자의 기기에서 채팅방에 실패한 메시지를 남긴다. 메시지에는 별도의 한도가
있다: 500 ms에 한 번, 1분에 30번이며, 넘으면 `RATE_LIMITED`다. 채팅방의 id는 읽기(`channel`)나 실행 파라미터에서
얻는다. 브라우저에서는 `NOT_IN_APP`이다.

### 플레이스 프로필: `placeProfile`, `placeProfiles`, `myProfile`

```ts
const me = await apps.data.myProfile(); // CloudProfile | null
const sender = chat.ownerId ? await apps.data.placeProfile(chat.ownerId) : null; // a member of the place
const named = await apps.data.placeProfiles(); // CloudList<CloudProfile> | null: name the place's members
const stop = await apps.data.observePlaceProfile(userId, profile => renderName(profile?.nick));
```

플레이스 프로필은 클라우드의 한 플레이스에서 멤버가 불리는 이름이다: 앱은 이를 그 클라우드에서의 멤버 id에
`<place id>@<user id>`로 연결하며, 주로 그곳에 표시되는 이름(`nick`)과 사진을 담는다 — DoU는 멤버를 이 이름으로
부르고, 이것이 없으면 멤버 자신의 이름으로 부른다. 플레이스의 모든 읽기와 마찬가지로, 페이지가 열린 플레이스에
대해서만 응답한다.

- `placeProfile(userId)`는 기기가 가진 그대로 멤버 한 명의 프로필을 읽고,
  `observePlaceProfile(userId, listener, { onEnd? })`는 그 프로필과 각 변경을 듣는다.
- `placeProfiles()`는 기기가 가진 플레이스의 프로필을 나열한다.
- `myProfile()`과 `observeMyProfile(listener, { onEnd? })`는 사용자 자신의 id로 같은 일을 한다.

프로필을 읽는 `user`와, 플레이스와 사용자의 id를 알려 주는 `session`이 필요하다: `session`이 없거나 세션이 아직
플레이스에 있지 않으면 `NOT_SUPPORTED`이고, `user`가 없거나 사용자가 다른 플레이스로 옮긴 뒤에는
`RUNTIME_NOT_ALLOWED`다. `null`은 기기가 그곳에서 그 멤버의 프로필을 가지고 있지 않다는 뜻이다: 멤버 자신의
이름으로 대체한다. 이들은 `call('profile.cacheRead', '<place id>@<user id>')`,
`call('profile.cacheReadList', { sid })`, `subscribe('profile.observeItem', [id], …)`이며, 이 호출들도 여전히
동작한다.

### mock에서

mock은 같은 맵으로 타입이 붙은 `data: { calls, streams, session, consent }`로 응답하고 — 모양이 틀린 응답은 타입
검사에서 실패한다 — `changeCloud()`로 클라우드 변경을 재현한다. mock은 앱의 화이트리스트를 모른다: 주어진 것에
응답한다. `chatSend`가 있으면 `chat.sendChat`을 스스로 열고, 보내기의 모양을 앱처럼 검사하며(채팅방의
플레이스와 보내기 한도는 검사하지 않음), 통과한 보내기를 각각 `sentMessages`에 기록한다.

## 권한

위에서 표시된 호출에는 페이지가 자신의 사이트에 있는 파일 `/.well-known/chatic-app.json`에서 요청하는 권한이
필요하다:

```json
{
    "manifestVersion": 1,
    "name": "Quiz",
    "permissions": ["share", "userKey"],
    "display": "titled",
    "orientation": "portrait"
}
```

페이지가 요청하고, 관리자가 페이지를 심사할 때 승인하며, 승인된 것만 배포된다. 이 파일이 없으면 페이지는 그
밖의 모든 것은 쓸 수 있지만 이 권한들이 여는 것은 쓸 수 없다: 권한이 필요한 호출은 `NOT_SUPPORTED`로 실패하고,
클라우드 데이터 권한이 없으면 `supports('data')`는 `false`다. `display`는 페이지가 보이는 방식을 정한다:

| `display`        | 사용자가 보는 것                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| `clean` (기본값) | 페이지만, 오른쪽 위 모서리에 작은 닫기 버튼이 떠 있다(그 자리를 비워 둘 것)                       |
| `titled`         | 페이지 위에 앱의 바가 있고, 제목과 닫기 버튼이 있다                                               |
| `immersive`      | `clean`과 같지만, 페이지가 상태 표시줄과 홈 인디케이터 아래까지 화면 전체를 채운다(레이아웃 참고) |

bridge 2.29.0 이전의 앱은 `titled`를 `standard`로, `clean`을 `fullscreen`으로 불렀고 그 이름만 안다: 새 이름을
받으면 페이지를 `clean`으로 보여 준다. 현재 앱은 둘 다 읽는다. `orientation`은 `any`, `portrait` 또는 `landscape`다. 앱은 페이지를
보여 주기 전에 파일을 읽고, 실행되는 동안 계속 유지하며, 이후 열 때마다 뒤에서 새 사본을 가져온다: 파일의 변경은
한 번 더 연 뒤에 반영된다.

## 오류

모든 실패는 `code`를 가진 `ChaticAppsError`다:

```ts
import { ChaticAppsError } from '@lemoncloud/chatic-apps-sdk';

try {
    const key = await apps.getUserKey();
} catch (error) {
    if (error instanceof ChaticAppsError && (error.code === 'NOT_SUPPORTED' || error.code === 'NOT_IN_APP')) {
        // A browser, an older app, or no `userKey` permission: sign in your own way.
    }
}
```

| 코드                   | 의미                                                                                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NOT_SUPPORTED`        | 사용할 수 없음: 오래된 앱, 페이지가 가지지 않은 권한, 또는 브라우저 클립보드나 저장소가 없음                                                                      |
| `NOT_IN_APP`           | 호출에 앱이 필요한데 페이지가 브라우저에 있음                                                                                                                     |
| `TIMEOUT`              | 앱이 10초 안에 응답하지 않음(백그라운드에 있던 시간은 세지 않음)                                                                                                  |
| `INVALID`              | 값이 없거나, 타입이 틀렸거나, 너무 김                                                                                                                             |
| `TOO_LARGE`            | 한 호출의 데이터가 65,536자를 넘음                                                                                                                                |
| `LINK_NOT_ALLOWED`     | 그 링크는 페이지에서 열거나 공유할 수 없음                                                                                                                        |
| `NOT_OPEN`             | 뷰가 이미 닫힌 뒤의 `finish`                                                                                                                                      |
| `UNAVAILABLE`          | 사용자 키를 만들 기기 id가 없음, 페이지의 저장소를 열 수 없음, 또는 기기에 카메라나 마이크가 없음                                                                 |
| `SETTINGS_ERROR`       | `openSettings()`: OS가 설정을 열지 않음                                                                                                                           |
| `QUOTA_EXCEEDED`       | 저장소 쓰기가 1,048,576자를 넘게 됨. 아무것도 쓰이지 않음                                                                                                         |
| `DISCONNECTED`         | `disconnect()`가 연결을 닫을 때 호출이 기다리던 중이었음. 또는 클라우드 데이터 스트림의 경우, 페이지가 back-forward 캐시에서 돌아와 스트림이 끝남(다시 구독할 것) |
| `RUNTIME_NOT_ALLOWED`  | `data`: 이 페이지가 쓸 수 있는 메서드가 아니거나, 앱이 현재 클라우드나 플레이스로 제한하는 인자 — 메시지라면 그 모양이나 그 채팅방                                |
| `CLOUD_CHANGED`        | `data`: 사용자의 클라우드가 더 이상 이 뷰가 열린 클라우드가 아님. 그 뒤로는 아무것도 응답하지 않음                                                                |
| `CONSENT_REFUSED`      | `data.connect()`: 사용자가 이 페이지가 이 클라우드를 읽도록 허용하지 않음                                                                                         |
| `RATE_LIMITED`         | `data`: 서버 읽기나 보낸 메시지가 너무 많음. `error.details.retryAfterMs`만큼 기다릴 것                                                                           |
| `UNSUPPORTED_PROTOCOL` | `connect()`만: 앱이 이 라이브러리보다 새로움. 라이브러리를 업데이트할 것                                                                                          |

이 표에 없는 코드는 그 호출이 실패한 것으로만 다룬다. 코드는 앱 자신의 것이라서 몇몇은 앱의 예전 용어를
유지한다(`RUNTIME_NOT_ALLOWED`는 `apps.data`에 관한 것이다).

## 알아 둘 규칙

- **무엇을 제공할지는 `apps.supports(...)`로 정한다**, 버전 번호로 정하지 않는다. 공유 버튼은
  `apps.supports('share')`일 때만 보인다.
- **진행하면서 저장한다.** 앱이나 페이지를 연 웹은 묻지 않고 언제든 페이지를 닫을 수 있다. `document`의
  `visibilitychange`를 듣고 `hidden`이 될 때 저장한다 — 앱은 "백그라운드로 간다"는 신호를 보내지 않는다.
- **페이지 주소가 아니라 `apps.link(params)`를 공유한다**: 그 링크를 탭하면 앱에서 페이지가 열린다. 공유 링크에
  필요한 것은 쿼리에 넣고 시작할 때 `location.search`에서 읽는다. 링크에서 페이지 루트 뒤의 것은 아무것도 남지
  않는다.
- **사용자 키는 계정이 아니며 아무것도 증명하지 않는다.** 한 기기에서 이 사이트에 대해서는 같고, 다른 모든
  사이트에서는 다르다. 한 휴대폰을 쓰는 두 사람은 같은 키를 공유하고, 키를 알게 된 누구든 그것을 보낼 수 있다.
  게임 진행 상황은 이 키로 보관하되, 돈은 보관하지 않는다.
- **`onCloseRequest`는 사용자가 잃을 것이 있을 때를 위한 것이다.** 3초 안에 두 번 닫으면 항상 닫히므로, 페이지가
  사용자를 붙잡아 둘 수 없다.
- **origin을 벗어나면 bridge를 벗어난다.** 다른 사이트로 가는 링크는 브라우저에서 열린다. 다른 `apps.chatic.io`
  주소의 페이지는 뷰 안에 로드되지만 아무 응답도 받지 못하므로, 그곳의 `connect()`는 `TIMEOUT`으로 끝난다.
- **오류 보고는 직접 볼 수 없다.** 보고는 DoU의 로그로 가고, 페이지를 심사하는 사람들이 읽는다. 오류를 보고
  싶다면 자신의 서버로도 보낸다.

## DoU에서 열렸을 때: `MiniAppLaunchParams`

DoU 자신이 페이지를 열 때 — 클라우드의 소유자가 페이지를 그 클라우드의 미니앱으로 등록했을 때 — `params`는
다음 모양이다(타입으로 export됨):

```ts
import type { MiniAppLaunchParams } from '@lemoncloud/chatic-apps-sdk';

const params = apps.context?.params as Partial<MiniAppLaunchParams> | undefined;
// { cloud: { id, name }, place: { id, name } | null, user: { id, name } }
```

`user.id`는 그 클라우드에서의 사용자 id다. 이것들은 보여 주기 위한 이름이지 누가 보고 있는지에 대한 증명이
아니다: 토큰이 없으므로 서버는 이를 로그인으로 취급해서는 안 된다. `user.isOwner`와 `miniApps`는 DoU 자체
허브에만 보내지며, 페이지는 결코 받지 않는다.

## 이 WebView의 특성

- **WebView 자체의 저장소가 아니라 `apps.storage`를 쓴다**: `localStorage`와 IndexedDB는 동작하지만 시스템이
  웹사이트 데이터를 지울 때마다 사라진다. 사용자를 따라 다른 휴대폰으로 가야 하는 것은 자신의 서버에
  `getUserKey()`로 보관한다.
- **팝업 없음**: `window.open`과 `target="_blank"`는 같은 뷰에 로드되므로, `window.opener`로 응답하는 로그인은
  동작하지 않는다. 리다이렉트 로그인을 쓴다.
- **다운로드**: 파일 다운로드는 iOS에서도 데스크톱에서도 처리되지 않는다. 대신 내용을 보여 준다.
- **데스크톱에서는** (`platform: 'desktop'`) 페이지가 DoU 위의 바가 있는 창에서 열린다: 기본 요청(`finish`,
  `setTitle`, 오류 보고)만 되고, 카메라나 마이크는 없으며, `apps.chatic.io` 아래가 아닌 사이트는 항상 바에 자기
  주소를 보여 준다.
- **카메라와 마이크**는 DoU의 이름으로 브라우저 API를 통해 동작한다: OS가 사용자에게 "DoU would like to…"라고
  묻는다. 페이지가 무엇을 쓰는지는 심사 대상이다.
- **자신의 서버**: 서버로 가는 호출은 `https://<name>.apps.chatic.io`에서 보내는 일반적인 cross-origin 요청이다.
  서버의 CORS 설정에서 그 origin을 허용한다.
- **레이아웃**: 매니페스트가 `immersive`를 설정하지 않는 한(아래) 페이지는 모든 가장자리에서 안전 영역 안에
  놓인다. 처리할 inset이 없다. 다크 모드에는 OS의 테마가 아니라 context의 `theme`을 쓴다 — 사용자는 DoU의 테마를
  휴대폰의 테마와 따로 설정할 수 있다.
- **Immersive** (`display: "immersive"`, app bridge 2.29.0): 페이지가 상태 표시줄, 홈 인디케이터, 가로 모드
  노치 아래까지 화면 전체를 채우며, 자신의 컨트롤은 페이지가 직접 그것들로부터 비켜 두어야 한다. 상태 표시줄은 계속 보인다. 앱은
  `<html>`에 `--chatic-safe-area-inset-top`, `-right`, `-bottom`, `-left`를 설정한다. 이것을 먼저 읽고, 모든
  Android WebView가 보고하지는 않는 `env()`로 대체한다. viewport meta는 `viewport-fit=cover`여야 한다: 이것이
  없으면 iOS가 스스로 페이지를 가로 모드 노치 밖에 두고, 거기에 속성으로도 패딩을 주면 그쪽은 두 번 패딩된다:

    ```css
    .hud {
        padding-top: var(--chatic-safe-area-inset-top, env(safe-area-inset-top, 0px));
    }
    .dock {
        padding-bottom: var(--chatic-safe-area-inset-bottom, env(safe-area-inset-bottom, 0px));
    }
    ```

    오래된 앱은 페이지를 `clean`처럼 패딩해서 보여 주고(오래된 데스크톱 앱은 바와 함께), inset은 0으로 읽히므로
    같은 CSS가 양쪽에서 맞다. 닫기 버튼은 여전히 오른쪽 위, 상태 표시줄 아래에 떠 있다. 상태 표시줄의 아이콘은
    앱의 테마를 따른다.

## 앱 없이 해 보기

`@lemoncloud/chatic-apps-sdk/mock`은 브라우저 탭을 앱의 대역으로 만든다. `connect()` 전에, 개발 환경에서만
설치한다:

```ts
import { connect } from '@lemoncloud/chatic-apps-sdk';
import { installChaticAppsMock } from '@lemoncloud/chatic-apps-sdk/mock';

const app = import.meta.env.DEV ? installChaticAppsMock({ permissions: ['share', 'userKey'] }) : null;
const apps = await connect();

// Play the user's side from the console or a dev button:
app?.pressBack();
app?.requestClose();
app?.changeContext({ theme: 'dark' });
console.log(app?.closed); // { by: 'page', result } once the page finishes, { by: 'user' } on a close
console.log(app?.storage); // what the page has stored
```

이미 저장된 데이터로 시작하려면 `storage: { … }`를 넘긴다. mock은 이를 메모리에만 보관한다.

mock은 앱처럼 응답하고 — 기본 호출과 넘겨준 `permissions`에 대해 응답하고, 나머지는 `NOT_SUPPORTED` — 앱이
확인하는 것을 확인하며, 모든 호출을 로그로 남긴다. mock은 대역일 뿐이다: 공유 시트는 보여 주는 대신 로그로
남기고, 사용자 키는 앱의 것이 아니며, 휴대폰에 대해서는 아무것도 증명하지 않는다.

## 버전

라이브러리가 `0.x`인 동안, 무엇이든 추가하는 릴리스 — 호출, 타입이 붙은 메서드, 필드 — 는 minor 버전을
올리고(`0.3.0`), 수정만 하는 릴리스는 patch를 올린다(`0.3.1`). 빌드에 쓰는 버전을 고정하고, 새 minor로 옮기기
전에 변경 사항을 읽는다.

페이지가 어떤 앱을 만나는지는 라이브러리가 아니라 앱의 일이다: 앱이 응답할 수 없는 호출은 `NOT_SUPPORTED`로
실패하므로, 버전 번호가 아니라 `apps.supports(...)`로 정한다. 버그 리포트를 읽을 때 쓰는 라이브러리 자체의
번호:

| 라이브러리        | 빌드 기준 bridge (`SDK_BRIDGE_VERSION`) | 데이터 계약 (`SDK_DATA_CONTRACTS`) | 추가된 것                                                                                                                                                                                                                                  |
| ----------------- | --------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.1.0             | 2.19.0                                  | —                                  | 기본 호출, 저장소, 공유, 사용자 키                                                                                                                                                                                                         |
| 0.2.0             | 2.20.0                                  | —                                  | 카메라와 마이크 권한, 패키지의 `GUIDE.md`와 `AGENTS.md`                                                                                                                                                                                    |
| next (unreleased) | 2.32.0                                  | `[1]`                              | 타입이 붙은 메서드, 행, 세션을 갖춘 `apps.data`; `sendMessage`; 플레이스 프로필(`placeProfile`, `placeProfiles`, `myProfile`과 그 `observe…`); 타입이 붙은 mock; `platform: 'desktop'`; `MiniAppLaunchParams` 타입; 스킬(`skill/SKILL.md`) |

데이터 계약은 `apps.data`가 읽는 것에 대한 앱 자신의 버전이다. 앱은 양쪽이 모두 지원하는 가장 새로운 계약으로
페이지에 응답한다. 앱이 지원하는 계약을 하나도 지원하지 않는 라이브러리는 `NOT_SUPPORTED`로 응답받는다.

## 페이지를 작성하는 AI 어시스턴트를 위해

이 패키지의 `AGENTS.md`는 페이지를 작성하는 어시스턴트를 위한 규칙을 담고 있다: 프로젝트, 호출, 페이지.
어시스턴트가 찾는 프로젝트 최상위에 복사하거나, 페이지가 할 일과 함께 프롬프트에 붙여 넣는다. `GUIDE.md`는
프로젝트를 설정하는 법을 설명한다.

`skill/SKILL.md`(한국어판 `skill/SKILL.ko.md`)는 어시스턴트를 위한 절차다: 작성자에게 한 번에 하나씩 묻고, 세 단계를
거쳐 아이디어에서 검증기를 통과한 zip까지 간다. 프로젝트로 복사하는 법은 `GUIDE.md`의 "프로젝트의 AI 어시스턴트를
위해"에 있다.

## 메인테이너를 위해

이 라이브러리는 앱과 어긋나지 않도록 DoU 앱의 저장소에 있다: 공개 타입은 타입 수준 테스트로 앱의 메시지 정의에
고정되어 있고, 앱의 계약 테스트가 이 클라이언트를 앱의 실제 페이지 호스트에 대고 실행한다. 클라우드 데이터의
행, 인자, 세션은 여기서 손으로 선언하며(앱의 타입은 비공개 패키지다), 앱의 계약 테스트
(`chaticAppsSdkRuntime.contract.test.ts`)가 앱의 것과 일치하도록 붙잡는다: 타입이 붙은 메서드는 화이트리스트가
여는 것과 권한별로 정확히 같아야 하고, 모든 행(그리고 네 단계 깊이까지 포함된 뷰)의 필드는 이름, 선택 여부,
타입이 앱의 것과 일치해야 한다. 그 테스트는 스스로 컴파일한다. 그 transform도 CI도 앱을 타입 검사하지 않기
때문이다. 앱 행의 필드를 빼거나 타입을 바꾸면 테스트가 실패한다. 이 라이브러리가 사용하는 프로토콜은
[mini-app-protocol.md](https://github.com/lemoncloud-io/dou-app/blob/develop/apps/mobile/docs/webview/mini-app-protocol.md)에
명세되어 있다.

```bash
npx jest --config libs/chatic-apps-sdk/jest.config.js
npx tsc -b libs/chatic-apps-sdk/tsconfig.json
npx nx build @chatic/chatic-apps-sdk      # dist/libs/chatic-apps-sdk, ready to publish
```

빌드는 `package.publish.json`을 배포용 `package.json`으로 쓴다(`publishConfig.access`가 `public`이므로, scoped
패키지가 실수로 private으로 배포되는 일이 없다). 빌드 결과물에서 배포한다:

```bash
cd dist/libs/chatic-apps-sdk && npm publish --dry-run
```
