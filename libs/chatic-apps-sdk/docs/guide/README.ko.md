> English: 패키지의 `GUIDE.md`(이 파일 옆의 `README.md`) — 영어판이 정본입니다. 두 판이 다르면 영어판을 따르세요.

# chatic-apps-sdk로 페이지 만들기

Chatic 앱은 DoU 앱 안에서 다른 모든 화면 위에 열리는 웹 페이지이며, 주소는
`https://<name>.apps.chatic.io`이다. 여느 웹 페이지처럼 만들면 되고, `@lemoncloud/chatic-apps-sdk`가
페이지를 앱에 연결한다. 닫기, 제목, 햅틱, 공유, 기기에 데이터 저장 등을 이것으로 한다.
이 가이드는 프로젝트를 구성하는 방법과 그 결과물을 다룬다. 라이브러리의 호출, 제한, 오류 코드는
패키지 `README.md`에 있으며, 이 가이드는 그것을 반복하지 않는다.

## 무엇을 만드는가

- **정적 파일.** 앱은 여느 브라우저처럼 웹 주소에서 페이지를 불러온다. 페이지 자체를 위해 직접
  운영할 서버는 없고, 서버 사이드 렌더링도 없다.
- **루트로 진입하는 한 페이지.** 앱은 항상 `/`를 연다. 링크는 데이터를 경로가 아니라 쿼리
  (`/?level=3`)에 담으므로, 페이지는 경로로 라우팅하지 않는다.
- **휴대폰 자체의 웹 뷰 안에서.** 페이지는 iOS에서는 WKWebView, Android에서는 Android System WebView에서
  실행되므로, 그 엔진들이 지원하는 것을 쓸 수 있다. 지원하려는 가장 오래된 휴대폰을 확인한다.
- **개발 중에는 브라우저에서도.** 라이브러리는 브라우저가 할 수 있는 동작으로 대체하고, 앱을 대신하는
  대역을 함께 제공하므로, 휴대폰 없이 페이지를 작성하고 시험해 볼 수 있다.

## 도구 고르기

라이브러리는 런타임 의존성이 없고 나머지에 대해 아무 전제도 두지 않으므로, 익숙한 것을 쓰면 된다.
도구가 적은 것부터 많은 것 순으로 세 가지 형태가 동작한다.

| 형태                           | 이럴 때 쓴다                              | 라이브러리를 가져오는 곳                          |
| ------------------------------ | ----------------------------------------- | ------------------------------------------------- |
| `index.html` 하나, 빌드 없음   | 작은 페이지, 프로토타입                   | `window.ChaticAppsSDK`를 정의하는 `<script>` 태그 |
| Vite와 일반 TypeScript 또는 JS | 화면 몇 개 분량의 로직을 가진 독립 페이지 | `npm install`                                     |
| Vite와 React, Vue 또는 Svelte  | 이미 이 중 하나로 인터페이스를 만든다     | `npm install`                                     |

결과가 정적 파일이면 무엇이든 괜찮지만, 다음 제한이 있다.

- **서버 렌더링도, 서버 라우팅도 없다.** 프레임워크의 서버 모드가 아니라 정적 모드나 싱글 페이지 모드를
  쓴다. Next.js는 `output: 'export'`, Nuxt는 `ssr: false` 또는 `nuxt generate`, SvelteKit은 싱글 페이지
  모드의 정적 어댑터가 필요하다.
- **경로에 의존하지 않는다.** 클라이언트 측 라우터는 페이지가 `/`로 진입한 상태에서 동작해야 하고,
  공유 링크에 도달하는 데 필요해서는 안 된다. 링크가 담는 것은 쿼리에 넣는다.
- **`window.opener`, 팝업, 파일 다운로드에 의존하지 않는다.** 팝업은 같은 뷰에서 열려 페이지를 대체하므로,
  `window.opener`로 응답하는 로그인은 동작할 수 없고, 다운로드는 iOS에서 처리되지 않는다. 대신 무엇을 할지는
  패키지 `README.md`에 있다.

Vite가 가장 짧은 길이며, 이 가이드의 나머지는 Vite를 쓴다.

## 프로젝트 구성하기

```bash
npm create vite@latest quiz -- --template vanilla-ts
cd quiz
npm install @lemoncloud/chatic-apps-sdk
```

원한다면 템플릿으로 `react-ts`, `vue-ts`, `svelte-ts` 중 하나를 대신 고른다. 아래 내용은 템플릿에
의존하지 않는다. `src/main.ts`를 앱에 연결하는 페이지로 바꾼다.

```ts
import { connect, ChaticAppsError } from '@lemoncloud/chatic-apps-sdk';
import { installChaticAppsMock } from '@lemoncloud/chatic-apps-sdk/mock';

// A stand-in for the app in the browser, in development only. Vite removes a branch that is always
// false, so it is not in the production bundle. The controller lets you play the user's side.
if (import.meta.env.DEV) {
    const app = installChaticAppsMock({ permissions: ['share', 'userKey'] });
    Object.assign(window, { app }); // then `app.pressBack()` in the browser console
}

async function start() {
    try {
        const apps = await connect();
        document.documentElement.dataset.theme = apps.context?.theme ?? 'light';
        apps.onContextChange(context => (document.documentElement.dataset.theme = context.theme));
    } catch (error) {
        // `UNSUPPORTED_PROTOCOL` means the app is newer than this library: update the library.
        const needsUpdate = error instanceof ChaticAppsError && error.code === 'UNSUPPORTED_PROTOCOL';
        document.body.textContent = needsUpdate ? 'This page needs an update.' : 'This page could not start.';
    }
}

void start();
```

그다음:

```bash
npm run dev      # the page in your browser, with the stand-in for the app
npm run build    # the bundle, in dist/
```

React, Vue, Svelte에서는 같은 줄을 애플리케이션이 시작하는 곳, 렌더링하기 전에 둔다.

### 브라우저에서 개발하기

`installChaticAppsMock`은 탭을 가짜 앱으로 바꾼다. 앱처럼 응답하고, 모든 호출을 로그로 남기며, 반환하는
컨트롤러로 사용자 쪽 동작을 흉내 낼 수 있게 한다. Android 뒤로 가기 버튼, 닫기 요청, 테마 변경 등이다
(위 예시는 컨트롤러를 `window`에 두므로 브라우저 콘솔에서 접근할 수 있다). 앱이 페이지의 매니페스트에
있는 권한만 허용하듯, mock도 나열한 권한만 허용한다. mock은 페이지의 로직을 증명할 뿐 휴대폰에 대해서는
아무것도 증명하지 않는다. 레이아웃, 키보드, 안전 영역, 실제 햅틱은 앱이 있어야 확인할 수 있다.

## 번들

넘겨주는 것은 정적 파일 폴더 하나다. Vite에서는 `dist/`이다.

```text
dist/
├── index.html
├── assets/
│   ├── index-3fa1c9.js
│   └── index-81b2d0.css
└── .well-known/
    └── chatic-app.json
```

- **`index.html`은 폴더 최상위에 있다.** `/`가 제공하는 것이 이 파일이다.
- **에셋은 루트 기준 주소로 참조된다** (`/assets/…`). Vite는 기본으로 이렇게 한다. 페이지는 항상 자기
  주소의 루트에서 제공되므로 `base` 경로를 설정하지 않는다.
- **`.well-known/chatic-app.json`은 페이지의 매니페스트다.** 앱은 페이지를 보여 주기 전에 이 파일을 읽는다.
  Vite에서는 파일을 `public/.well-known/chatic-app.json`에 두면 빌드가 그대로 복사한다.
- **그 밖에는 아무것도 필요 없다**: 서버 코드도, `package.json`도, 소스 파일도 없다. 빌드가 없어도 구성은
  같다. `index.html`과 그 옆의 `.well-known/chatic-app.json`이다.

매니페스트는 페이지의 이름을 정하고 필요한 것을 요청한다.

```json
{
    "manifestVersion": 1,
    "name": "Quiz",
    "permissions": ["share", "userKey"],
    "orientation": "portrait"
}
```

페이지에는 기본적으로 바가 없다. 작은 닫기 버튼이 항상 오른쪽 위 모서리에 떠 있고, 페이지가 자기 헤더를
직접 그린다(`"display": "clean"`). 대신 페이지 제목과 닫기 버튼이 있는 앱의 바를 쓰려면
`"display": "titled"`를 추가한다. 게임처럼 자기 화면을 화면 가장자리까지 그리는 페이지는
`"display": "immersive"`를 설정한다. 그러면 페이지가 상태 표시줄과 홈 인디케이터 아래에서 실행되며,
README의 레이아웃·Immersive 항목이 설명하는 inset으로 자기 컨트롤에 여백을 직접 준다.

`manifestVersion`은 `1`이어야 한다. 앱은 읽을 수 없는 매니페스트를 무시한다. 페이지가 쓰는 권한만
요청한다 — `clipboard`, `share`, `openUrl`, `userKey`, 그리고 앱의 데이터를 읽기 위한 `session`,
`cloud`, `place`, `channel`, `chat`, `user` — 각 권한이 무엇을 열어 주는지, 그리고 `display`와
`orientation`에 대해서는 패키지 `README.md`를 본다. 매니페스트가 없어도 페이지는 실행되며, 그 권한들이
열어 주는 것을 제외한 모든 것을 얻는다.

## 앱 안에서 페이지가 동작하는 방식

브라우저용으로 먼저 작성된 페이지에서 가장 자주 예상을 벗어나는 점들이다. 각각의 자세한 내용은 패키지
`README.md`에 있다.

- **앱은 언제든 페이지를 닫을 수 있다.** 진행하면서 저장하고, `document`가 `hidden`이 될 때도 저장한다.
  페이지 자체의 데이터는 시스템이 웹사이트 데이터를 지울 때 사라지는 `localStorage`가 아니라
  `apps.storage`에 둔다. 다른 휴대폰으로 사용자를 따라가야 하는 것은 직접 운영하는 서버에 `apps.getUserKey()`로
  받은 키로 구분해 둔다.
- **페이지는 모든 가장자리에서 안전 영역 안에 놓인다.** 단, 매니페스트가 `immersive`를 요청한 경우는
  예외다. 처리할 inset이 없으며, `immersive` 페이지는 직접 처리한다.
- **다크 모드는 휴대폰이 아니라 앱의 테마를 따른다.** `apps.context.theme`에서 가져온다.
- **페이지 주소가 아니라 `apps.link({ … })`를 공유한다.** 링크가 담은 것은 페이지가 시작할 때
  `location.search`에서 읽는다.
- **매니페스트가 요청하지 않는 한 제목 바가 없으므로**, 페이지가 자기 헤더와 제목을 그린다.
  [화면과 뒤로 가기](#화면과-뒤로-가기)를 본다.
- **Android 뒤로 가기**는 `apps.onBack(handler)`를 설정해 둔 동안에만 페이지의 것이다. 그렇지 않으면 앱이
  결정한다.
- **오류**: 모든 호출은 `ChaticAppsError`를 던질 수 있다. `message`가 아니라 `code`로 분기한다.

## 화면과 뒤로 가기

메뉴, 게임, 설정 페이지처럼 화면이 둘 이상인 페이지는 자기만의 뒤로 가는 방법이 필요하다. 기댈 바도
뒤로 가기 화살표도 없다. 앱이 주는 유일한 컨트롤은 오른쪽 위 모서리의 작은 닫기 버튼이며, 이것은 페이지를
떠난다. Android에는 뒤로 가기 키가 있고 iOS에는 없다. 그래서 페이지는 자기 화면의 스택을 유지하고, 자기
뒤로 가기 버튼을 그리며, 돌아갈 화면이 있는 동안에만 Android 뒤로 가기 키를 가져간다.

```ts
const screens = ['home'];

// Take Android back while a screen is stacked; give it back at the root, where the app closes the page.
const sync = () => apps.onBack(screens.length > 1 ? back : null);

function open(name: string) {
    screens.push(name);
    sync();
    render();
}

function back() {
    if (screens.length > 1) screens.pop();
    sync();
    render();
}

sync();
```

`screens.length > 1`일 때마다 헤더에 뒤로 가기 버튼을 그리고 `back()`을 호출하게 한다. 루트에서는 닫기
버튼이 이미 있으므로 아무것도 그리지 않는다. React, Vue, Svelte에서는 `screens`를 상태로 두고, 그 길이가
바뀔 때 실행되는 effect에서 `apps.onBack`을 호출한다. 같은 패턴으로 대화상자도 닫는다. 열린 대화상자를
하나의 화면으로 취급한다.

건드리지 말아야 할 세 가지가 있다. 루트에서는 핸들러를 설정하지 않아 Android 뒤로 가기가 여전히 페이지를
닫게 한다. 탐색에 `onCloseRequest`를 쓰지 않는다 — 그것은 저장하지 않은 작업을 위한 것이다. 그리고 화면은
브라우저의 히스토리가 아니라 메모리에 둔다. 항목을 push하는 라우터(해시 라우트, `pushState`)는 페이지에
히스토리를 만들고, 히스토리가 있으면 루트에서 Android 뒤로 가기가 페이지를 닫는 대신 그 히스토리를
거슬러 간다. iOS에서는 가장자리 스와이프가 그 히스토리만 거슬러 가므로, 메모리 내 스택에는 어느 경우든
위의 뒤로 가기 버튼이 필요하다.

모든 화면의 오른쪽 위 모서리에는 자기 컨트롤을 두지 않는다. 닫기 버튼이 그곳에 떠 있다.

## 클라우드의 데이터를 쓰는 페이지

클라우드에서 열린 페이지는 `apps.data`로 그 클라우드 — 플레이스, 채팅방, 메시지, 멤버 — 를 읽을 수 있고,
텍스트 메시지를 보낼 수 있다. 모든 메서드와 그 인자, 응답하는 행은 패키지 `README.md`에 나열되어 있다.
여기서는 그것들을 중심으로 페이지를 만드는 방법을 다룬다.

**페이지가 보여 주는 것에 따라 권한을 고른다.** `session`, `cloud`, `place`, `channel`, `chat`, `user`는
각각 한 묶음의 읽기를 열고, `chatSend`는 보내기를 연다. 앱은 읽기가 응답하는 내용을 걸러내지 않는다.
`user`, `channel`, `chat`이 있는 페이지는 사용자의 로그인 id를 받고, `place`가 있는 페이지는 계정 서버가
가진 그대로 각 플레이스의 소유자를 받으며, `cloud`가 있는 페이지는 클라우드의 계정 정보를 받는다. 일을
해내는 데 필요한 최소한만 요청하고 — 읽은 것으로 페이지가 무엇을 하는지는 작성자의 책임이다 — 사용자에게
알리지 않고는 그 어떤 것도 기기 밖으로 보내지 않는다.

```json
{ "manifestVersion": 1, "name": "Room stats", "permissions": ["session", "channel", "chat"] }
```

**사용자를 기다린다.** `apps.data.connect()`에서 앱은 이 페이지가 이 클라우드를 읽어도 되는지 사용자에게
묻고, 사용자가 걸리는 만큼 기다린다. 페이지 자체의 틀을 먼저 보여 주고, 그다음 연결한다.
거부는 `CONSENT_REFUSED`다. 페이지가 왜 그 데이터가 필요한지 말하고 닫기를 제안한다.

```ts
const apps = await connect();
if (!apps.supports('data')) return showNotAvailableHere(); // a browser, the desktop, an old Android WebView, an older app
try {
    await apps.data.connect();
} catch (error) {
    if (error instanceof ChaticAppsError && error.code === 'CONSENT_REFUSED') return showWhyWeAsk();
    throw error;
}
const session = apps.data.session(); // CloudSession | null — null without `session`
const placeId = session?.committedSiteId ?? undefined; // undefined without `session`
```

**타입과 함께 읽는다.** 앱이 여는 모든 메서드에는 타입이 있으므로, 에디터가 이름을 자동 완성하고 잘못된
인자는 빌드를 실패시킨다. 행은 대부분 선택적 필드다. 각 필드를 대체값과 함께 읽는다.

```ts
const rooms = await apps.data.call('channel.cacheReadList', { sid: placeId });
for (const room of rooms?.list ?? []) console.log(room.name ?? '(no name)', room.unreadCount ?? 0);
```

**스트림에는 한도가 있다.** 한 페이지는 페이지 로드당 최대 16개를 가지며, 그다음 `subscribe`는 `INVALID`로
실패한다. 화면에 있는 것을 구독하고, 화면에서 사라지면 `stop()`하며, 보여 주는 행만 보관한다 — 이벤트 하나가
목록 전체를 담을 수 있다.

**페이지가 열려 있는 동안 클라우드가 바뀔 수 있다.** 사용자가 다른 클라우드로 옮기면 모든 스트림이
`CLOUD_CHANGED`로 끝나고, `onCloudChanged`가 한 번 발생하며, 그 뒤로는 아무것도 응답하지 않는다. 페이지를
끝내거나 안내를 보여준다. 재시도하지 않는다.

```ts
apps.data.onCloudChanged(() => apps.finish());
```

**사용자가 보내기로 고른 것만 보낸다.** `apps.data.sendMessage(roomId, text)`는 사용자의 이름으로, 페이지가
열린 플레이스의 채팅방에 메시지를 보낸다. 사용자가 직접 탭했을 때, 사용자가 본 텍스트를 보낸다.

**mock을 대상으로 개발한다.** mock은 주어진 데이터로 응답하며, 앱과 같은 맵으로 타입이 지정되어 있으므로
모양이 잘못된 응답은 앱에서 실패하기 전에 빌드에서 실패한다.

```ts
import { installChaticAppsMock } from '@lemoncloud/chatic-apps-sdk/mock';

const app = installChaticAppsMock({
    permissions: ['session', 'channel', 'chatSend'],
    data: {
        session: {
            context: {
                cloud: { cloudId: 'cloud-1', siteId: 'place-1', isActive: true },
                identity: { userId: 'user-1', isAuthenticated: true },
            },
            committedSiteId: 'place-1',
        },
        calls: {
            'channel.cacheReadList': () => ({
                list: [{ id: 'room-1', cid: 'cloud-1', sid: 'place-1', isNotificationEnabled: true, name: 'Lobby' }],
                meta: { total: 1 },
            }),
        },
    },
});
// later: app.sentMessages, app.changeCloud()
```

mock에는 실제 클라우드의 것이 아니라 지어낸 id와 이름을 쓴다. mock은 앱이 어떤 권한에 어떤 메서드를 여는지
알지 못한다 — 주어진 것을 응답할 뿐이다 — 그러므로 앱에서 `connect()`의 `allowed`를 확인한다.

## 직접 운영하는 서버

페이지는 정적 파일이고 계속 그래야 한다. 서버 렌더링도, 서버 라우팅도 없다. 점수, 저장한 작업, 사용자끼리
나누는 것처럼 자기 서버가 필요하면, 그 서버는 자기 origin에 있는 API이고 페이지는 `fetch`로 그것을 부른다.

**페이지의 origin을 허용한다.** 페이지에서 보내는 호출은 `https://<name>.apps.chatic.io`에서 오는 평범한
cross-origin 요청이다. 그래서 서버는 그 origin을 지정한 CORS 헤더로 응답하고, JSON `POST`가 먼저 보내는
preflight에도 응답한다:

```http
Access-Control-Allow-Origin: https://<name>.apps.chatic.io
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
Vary: Origin
```

시험하는 동안에는 개발용 주소도 허용하고(다음 절 참고), 페이지가 공개된 뒤에는 `*`를 쓰지 않는다.

**사용자는 사용자 키로 구분하되, 그 키에 다른 것을 기대하지 않는다.** `apps.getUserKey()`(`userKey` 권한)는
한 기기와 이 사이트에 대해 늘 같은 64자리 16진수를 돌려준다. 요청마다 이것을 보내고, 서버에서는 사용자의
데이터를 이 키로 구분해 둔다. 이것은 로그인이 아니다. 한 휴대폰을 쓰는 두 사람은 같은 키를 공유하고, 키를
알게 된 사람은 누구나 그것을 보낼 수 있다. 게임 진행은 이 키로 보관해도 되지만 돈, 구매, 다른 사용자에게서
빼앗을 수 있는 것은 두지 않는다. 그런 것이 필요하면 리다이렉트 방식의 자체 로그인을 붙인다. 앱에서는 팝업
로그인이 동작하지 않는다(`window.open`은 같은 뷰에 로드되고, `window.opener`로는 아무것도 응답하지 않는다).

**페이지가 보내는 것은 아무것도 믿지 않는다.** 페이지는 사용자의 기기에서 돌고, 누구나 아무 본문, 아무 사용자
키, 아무 `params`로 API를 직접 부를 수 있다. 서버에서 모든 값을 공개 웹의 폼을 다루듯 검사한다.
`MiniAppLaunchParams`는 누가 보고 있는지를 알려 줄 뿐 아무것도 증명하지 않는다.

**클라우드에서 읽은 것이 기기를 떠나면 그 책임은 작성자에게 있다.** 사용자는 페이지가 `apps.data`로 클라우드를
읽도록 허락했을 뿐, 다른 곳으로 보내도록 허락하지 않았다. 페이지가 멤버의 이름이나 메시지를 자기 서버로
보낸다면, 보내기 전에 페이지에서 그렇다고 알리고, 기능에 필요한 것만 보내며, 필요한 기간보다 오래 보관하지
않는다.

## 앱 안에서 시험하기

mock을 쓴 브라우저는 페이지의 로직을 증명할 뿐이고, 레이아웃, 키보드, 실제 햅틱은 앱에서만 볼 수 있다. 작업
중인 페이지를 배포하기 전에 앱에서 열려면, 개발 서버에 https 주소를 주고 직접 소유한 클라우드에 미니앱으로
추가한다.

1. 개발 서버를 실행하고, 터널로 https 주소에 노출한다. `cloudflared`는 이 용도로 계정이 필요 없다:

    ```bash
    npm run dev                                       # Vite, on http://localhost:5173
    cloudflared tunnel --url http://localhost:5173    # prints https://<random words>.trycloudflare.com
    ```

    Vite는 모르는 호스트를 거부하므로 터널의 호스트를 허용한다:

    ```ts
    // vite.config.ts
    export default defineConfig({ server: { allowedHosts: ['.trycloudflare.com'] } });
    ```

2. 휴대폰의 DoU 앱에서 직접 소유한 클라우드를 고른 상태로 **MY → 설정 → Lab → Mini apps**로 가서 **Add mini
   app**을 누르고, 이름과 그 주소(`https://…`, 포트 없이)를 넣는다. 이 목록은 그 휴대폰에만 저장된다. 그다음
   **Open mini apps**를 눌러 미니앱 홈에서 그것을 고른다. 처음 열 때 DoU는 내 이름, 클라우드 안에서의 내 id,
   클라우드, 열려 있는 플레이스를 페이지에 넘기기 전에 묻는다.
3. 터널의 주소는 시작할 때마다 바뀐다. 같은 목록에서 그 미니앱을 눌러 주소를 고친다.

터널의 주소는 터널이 떠 있는 동안만 유효하다. 고정된 주소가 필요하면 빌드를 https를 주는 아무 정적 호스팅(Vercel,
Netlify 같은 곳의 미리보기 배포)에 올리고 그 주소를 대신 추가한다. 똑같이 열리고 아래의 한계도 같지만, 고칠
때마다 다시 배포해야 한다.

이렇게 연 페이지는 심사를 거친 페이지가 아니라 외부 사이트로 열리고, `apps.chatic.io`에 배포된 뒤보다 받는
것이 적다:

- **기본 요청만.** 닫기, 햅틱, Android 뒤로 가기, 닫기 가드, 오류 보고, 저장소, 카메라와 마이크 권한은
  동작한다. `setTitle`은 응답하지만 바에는 계속 호스트가 표시된다. `getUserKey`, `copy`, `share`, `openUrl`은 `NOT_SUPPORTED`로 실패한다. 데스크톱 앱은 이보다도
  적게, 닫기, 제목, 오류 보고에만 응답한다.
- **매니페스트 없음.** 앱은 페이지의 `/.well-known/chatic-app.json`을 읽지 않는다. 바는 늘 표시되고 터널의
  호스트가 제목이 되며, `display`와 `orientation`은 적용되지 않는다.
- **클라우드 데이터 없음.** `apps.supports('data')`가 `false`이므로 이 방법으로는 `apps.data`를 앱에서 시험할
  수 없다. mock으로 만들고, 페이지가 심사를 거친 뒤 앱에서 확인한다.
- **저장소가 따로다.** 저장소는 origin마다 따로 보관되므로, 여기서 저장한 것은 실제 주소에서 찾을 수 없다.

## 프로젝트의 AI 어시스턴트를 위해

패키지는 `AGENTS.md`를 함께 제공한다. Chatic 앱을 작성하는 AI 어시스턴트를 위한 규칙이다. AI 어시스턴트는
`node_modules` 안의 것이 아니라 프로젝트 최상위의 `AGENTS.md`를 읽으므로, 그곳으로 복사하거나 AI 어시스턴트가
`node_modules/@lemoncloud/chatic-apps-sdk/AGENTS.md`를 보게 한다.

## 넘겨주기 전에

- [ ] `npm run build`가 최상위에 `index.html`과 `.well-known/chatic-app.json`이 있는 `dist/`를 만든다.
- [ ] 일반 파일 서버에서 열었을 때, 빌드된 페이지가 주소에 경로 없이 루트에서 동작한다.
- [ ] 페이지가 앱 없는 브라우저(`apps.inApp`이 `false`)와 대역 양쪽에서 동작한다.
- [ ] 매니페스트의 모든 권한이 쓰이고, 권한이 필요한 모든 호출이 `apps.supports(…)`로 보호되거나
      `NOT_SUPPORTED`를 처리한다.
- [ ] 상태가 버튼을 누를 때만이 아니라 사용자가 진행하는 동안 저장된다.
- [ ] `window.opener`, 팝업 로그인, 파일 다운로드, 서버 사이드 렌더링이 없다.
- [ ] 오류, `reportError`, 페이지 자체의 로그에 사용자 데이터가 없다.
- [ ] 자기 서버를 부르는 페이지: 서버가 페이지의 origin을 허용하고, 받는 모든 값을 검사하며, 사용자 키
      하나에만 기대어 가치 있는 것을 두지 않는다.
- [ ] 클라우드를 읽는 페이지: 쓰는 클라우드 데이터 권한만 요청하고, `CONSENT_REFUSED`와 `CLOUD_CHANGED`를
      처리하며, 더 이상 보여 주지 않는 모든 스트림을 멈춘다.

## 배포하기

페이지를 제출하고 심사받고 주소에 배포하는 방법은 아직 이 가이드에 포함되어 있지 않다.
