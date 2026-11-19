---
name: chatic-mini-app
description: DoU 앱 안에서 열리는 페이지인 Chatic 미니앱을 웹 페이지를 만들어 본 적 없는 사람과 함께 만든다 — 아이디어를 묻고, SDK의 mock 위에서 만들고, 검증하고 zip으로 묶는다.
---

> English: [SKILL.md](./SKILL.md) — 영어판이 정본입니다. 두 판이 다르면 영어판을 따르세요.

# Chatic 미니앱을 차근차근 만들기

`@lemoncloud/chatic-apps-sdk` 0.3.0과 `@lemoncloud/chatic-apps-devtools` 0.1.0 기준으로 쓴 것이다.

이 문서는 누군가 Chatic 미니앱 — DoU 앱 안에서 열리는 웹 페이지 — 을 만들도록 돕는 AI 어시스턴트가 따르는
절차다. 그 사람은 웹 페이지를 한 번도 만들어 본 적이 없을 수 있다. 질문을 주고받으며 세 단계 — 아이디어, 초기 구축,
배포 준비 — 를 차례로 이끌고, 검증기를 통과한 zip으로 끝낸다. 바로 코드로 뛰어들지 않는다.

이 절차가 다시 적지 않는 것은 같은 패키지의 문서 셋에 있다. 그것에 기대는 코드를 쓰기 전에 필요한 부분을 읽는다.

- `AGENTS.ko.md`(정본은 영어판 `AGENTS.md`) — 모든 페이지가 지키는 규칙. 이 절차는 가리키기만 한다.
- `README.ko.md`(영어판 `README.md`) — 모든 호출과 인자 · 한도 · 오류 코드, 권한마다 열리는 것.
- `GUIDE.ko.md`(영어판 `GUIDE.md`) — 프로젝트를 꾸리는 법, 번들, 화면과 뒤로 가기, 클라우드의 데이터, 서버.

## 해도 되는 것

- **프로젝트 폴더 안의 파일만 고친다.** 그 밖은 건드리지 않는다.
- **설치는 한 번**, 2단계에서만 한다: 아래 시작 `package.json`에 적힌 패키지와 버전 그대로. 설치하기 전에 무엇을
  설치하는지 말하고 묻는다. 그 밖의 것은 절대 설치하지 않는다.
- **프로젝트의 스크립트만 돌린다**: 페이지를 보여 주는 `npm run dev`, `npm run build`, `npm run verify`,
  `npm run bundle`.
- 스스로 네트워크 요청을 하지 않고, 프로젝트 밖의 경로를 읽거나 쓰지 않으며, 무엇도 업로드 · 제출 · 배포하지 않는다.

## 지금 어디쯤인가

이 절차를 시작할 때마다 먼저 한다.

1. **프로젝트 맨 위의 `MINIAPP.md`가 있으면 읽는다.** 계획이자 상태다. 어느 단계에 있고 무엇이 남았는지 말하고
   거기서 이어 간다. 이 파일이 이미 답한 것은 다시 묻지 않는다.
2. **SDK 버전을 확인한다.** `node_modules/@lemoncloud/chatic-apps-sdk/package.json`이 있고 그 `version`이 이 문서
   맨 위의 것과 다르면 알린다: 이 절차의 사본이 오래됐을 수 있고, 새 사본은 설치된 패키지에 들어 있다(`GUIDE.ko.md`의
   "프로젝트의 AI 어시스턴트를 위해").
3. **아니면 1단계부터** 시작하되, 그 사람이 이미 말한 것을 바탕으로 한다.

## 묻는 법

- **한 번에 하나씩**, 그 사람이 쓰는 말로, 쉬운 말로 묻는다.
- **고를 것이 있으면 보기 2 ~ 4개**를 주고, 무엇을 추천하는지와 그 이유를 한 줄로 말한다. 그 사람은 언제든 자기
  말로 답해도 된다.
- **용어는 처음 나올 때 한 줄로 푼다**: *권한*은 페이지가 매니페스트에서 앱에 요청하는 것, *매니페스트*는 페이지의
  이름과 권한 목록을 적는 작은 파일, *mock*은 브라우저에서 앱 대신 도는 대역이다.
- **이미 말한 것은 다시 묻지 않는다.** 처음에 많이 말했으면 빈 것만 묻는다. "그냥 만들어"라고 하면 1단계를 요약
  확인 한 번으로 줄인다.
- **단계마다 끝에서** 짧게 정리해 보여 주고 "다음 단계로 갈까요?"라고 묻는다.

## 1단계 — 아이디어

아직 모르는 것을 대략 이 순서로 묻는다. 줄마다 질문, 그리고 추천이다.

1. 미니앱이 무엇을 하는지 몇 문장으로 말해 주세요. — 추천할 것 없이 그 사람이 설명하게 한다.
2. 누가, 언제 쓰나요? — 클라우드의 한 플레이스 멤버들이 DoU 안에 있을 때.
3. 화면은 무엇이 있고 화면마다 무엇이 있나요? — 둘이나 셋으로 시작한다: 첫 화면과 거기서 가는 화면.
4. 닫힐 때 결과를 돌려주나요? — 아니요. 결과를 받으려고 연 곳이 있을 때만.
5. 클라우드의 대화방 · 메시지 · 멤버를 쓰나요? — 아이디어에 필요할 때만. 하나하나가 사용자가 허락하는 권한이고,
   받은 것으로 무엇을 하는지는 페이지 작성자가 책임진다.
6. 공유 · 복사 · 바깥 링크 열기가 필요한가요? — 아이디어에 필요한 것만. 이것도 하나하나 권한이다.
7. 게임처럼 화면 전체가 필요한가요? — 아니요. 보통 화면이면 앱의 닫기 버튼과 휴대폰의 안전 영역을 알아서 맞춰 준다.
8. 사용자가 잃으면 안 되는 것 — 진행 상황, 작성 중인 글 — 이 있나요? — 바뀔 때마다 기기에 저장한다.
9. 직접 운영하는 서버를 부르나요? — 서버가 없는 것이 가장 단순하다. 있다면 `GUIDE.ko.md`의 "직접 운영하는 서버"를
   함께 읽는다.

그다음 프로젝트 맨 위에 `MINIAPP.md`를 그 사람의 말로 쓰고 보여 준다.

```markdown
# <name of the mini-app>

Stage: 1 idea — done · 2 first build — next · 3 release prep — not started

## What it does

<a few sentences>

## Screens

1. <first screen>: <what is on it>
2. <screen>: <what is on it, how it is reached, how back returns>

## What it asks the app for

- Permissions: <none, or each one with the reason>
- Display: clean · Orientation: portrait
- Result when it closes: <none, or what>
- Saved on the device: <none, or what>
- Own server: <none, or its address and what it receives>

## Progress

- [ ] Starting files and first install
- [ ] <one line per screen>
- [ ] Verify passes
- [ ] Zip built
```

## 2단계 — 초기 구축

1. **도구를 묻는다.** 이미 쓰는 프레임워크가 있나? 추천은 없음: Vite와 그냥 TypeScript다.
   React · Vue · Svelte라고 하면 `GUIDE.ko.md`의 "도구 고르기"를 따르고, 아래의 나머지는 그대로 둔다.
2. **시작 파일을 깐다.** 그 사람에게 이미 시작점으로 쓸 미니앱이 있으면 그것을 복사한다.
   없으면 아래 시작 파일을 만든다. 매니페스트는 `MINIAPP.md`에서 채운다: 이름, 그리고 거기 적힌 권한만.
3. **묻고 설치한다.** 이렇게 말한다: "이 폴더에 @lemoncloud/chatic-apps-sdk 0.3.0, @lemoncloud/chatic-apps-devtools
   0.1.0, Vite 7.3.0, TypeScript 5.9.3을 `npm install`로 설치할게요. 진행할까요?" 그렇다고 할 때만 `npm install`을
   돌린다.
4. **화면은 하나씩 만든다.** 화면을 쓰고, `npm run dev`를 돌리고, 출력된 주소를 브라우저에서 열어 보라고 한다: 거기서는
   mock이 앱 대신 페이지에 답한다. 무엇을 바꿀지 묻고, 바꾸고, `MINIAPP.md`에서 그 화면에 표시한다. 만드는 동안
   `AGENTS.ko.md`의 규칙을 지킨다 — 화면은 메모리 안의 목록과 `apps.onBack`으로, 테마는 앱의 것, 저장은
   `apps.storage`, 분기는 메시지가 아니라 코드로.
5. **mock에는 지어낸 데이터를 준다**(`src/mockData.ts`): 페이지가 읽는 것에 대해 지어낸 id와 이름만, 실제 클라우드의
   것은 쓰지 않는다.
6. **화면이 둘 이상이 되면** `chatic-apps.scenarios.ts`에 화면을 적어 검증기에게 알려 준다. 그래야 화면마다 뒤로 가기와
   정리를 시험한다.
7. `MINIAPP.md`의 단계 줄을 고치고, 정리해 보여 주고, 다음으로 갈지 묻는다.

### 시작 파일

`package.json` — 버전은 이대로, 그 밖의 것은 설치하지 않는다.

```json
{
    "name": "my-mini-app",
    "private": true,
    "type": "module",
    "scripts": {
        "dev": "vite",
        "build": "tsc --noEmit && vite build",
        "verify": "chatic-apps verify",
        "bundle": "chatic-apps bundle"
    },
    "dependencies": {
        "@lemoncloud/chatic-apps-sdk": "0.3.0"
    },
    "devDependencies": {
        "@lemoncloud/chatic-apps-devtools": "0.1.0",
        "typescript": "5.9.3",
        "vite": "7.3.0"
    }
}
```

`tsconfig.json`:

```json
{
    "compilerOptions": {
        "target": "ES2022",
        "module": "ESNext",
        "moduleResolution": "bundler",
        "lib": ["ES2022", "DOM"],
        "types": ["vite/client"],
        "strict": true,
        "resolveJsonModule": true,
        "isolatedModules": true,
        "skipLibCheck": true,
        "noEmit": true
    },
    "include": ["src", "public/.well-known/chatic-app.json", "chatic-apps.scenarios.ts"]
}
```

`index.html`:

```html
<!doctype html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>My mini-app</title>
    </head>
    <body>
        <main id="app"></main>
        <script type="module" src="/src/main.ts"></script>
    </body>
</html>
```

`public/.well-known/chatic-app.json` — 매니페스트. `MINIAPP.md`에 적힌 권한만 넣는다.

```json
{
    "manifestVersion": 1,
    "name": "My mini-app",
    "permissions": [],
    "display": "clean",
    "orientation": "portrait"
}
```

`src/main.ts` — 연결하고, mock은 개발 중에만 쓴다.

```ts
import { ChaticAppsError, connect, type ChaticApps } from '@lemoncloud/chatic-apps-sdk';
import { installChaticAppsMock, type MockPermission } from '@lemoncloud/chatic-apps-sdk/mock';

import manifest from '../public/.well-known/chatic-app.json';
import { mockData } from './mockData';

const root = document.getElementById('app') as HTMLElement;

function start(apps: ChaticApps) {
    document.documentElement.dataset.theme = apps.context?.theme ?? 'light';
    apps.onContextChange(context => (document.documentElement.dataset.theme = context.theme));
    root.textContent = 'Hello from my mini-app';
}

async function main() {
    // The stand-in for the app, in the browser during development only: a production build drops it.
    if (import.meta.env.DEV) {
        installChaticAppsMock({ permissions: manifest.permissions as MockPermission[], data: mockData });
    }
    try {
        start(await connect());
    } catch (error) {
        const needsUpdate = error instanceof ChaticAppsError && error.code === 'UNSUPPORTED_PROTOCOL';
        root.textContent = needsUpdate ? 'This page needs an update.' : 'This page could not start.';
    }
}

void main();
```

`src/mockData.ts` — 페이지가 클라우드를 읽을 때 mock이 답하는 것. 브라우저와 `verify` 둘 다 이것을 쓴다. 페이지가
무언가를 읽기 전까지는 비어 있다.

```ts
import type { MockData } from '@lemoncloud/chatic-apps-sdk/mock';

// Made-up data only: invented ids and names, never a real cloud's.
export const mockData: MockData = {};
```

`chatic-apps.scenarios.ts` — 화면이 생기면 쓴다. `open`마다 첫 화면에서 그 화면까지 누르는 순서를 적는다.

```ts
import { mockData } from './src/mockData';

export default {
    data: mockData,
    ready: '[data-action="start"]',
    screens: [{ name: 'question', open: ['[data-action="start"]'] }],
    actions: [],
};
```

## 3단계 — 배포 준비

1. **검증한다.** `npm run build` 다음에 `npm run verify`를 돌린다. 매니페스트 · 코드 · 빌드를 점검하고, mock 위에서
   페이지를 시험한다: 뒤로 가기, 닫기, 테마, 숨김, 거절.
2. **출력된 줄을 하나씩** 다룬다: 무엇이 문제이고 무엇을 바꿀지 쉬운 말로 말하고, 바꾸기 전에 묻는다. 고친 뒤 다시
   빌드하고 검증한다. verify가 "넘길 준비가 됐습니다"로 끝나기 전에는 끝났다고 말하지 않는다.
3. **앱에서 직접 볼지 묻는다.** 휴대폰에서 보고 싶다고 하면 `GUIDE.ko.md`의 "앱 안에서 시험하기"를 따르고, 시작하기 전에
   그 한계를 말한다.
4. **묶는다.** `npm run bundle`을 돌린다: 빌드를 zip으로 쓰고, 맨 위에 `index.html`과 매니페스트가 있다. zip이 어디
   있는지 알려 준다.
5. **`GUIDE.ko.md`의 "넘겨주기 전에"를** 그 사람과 한 항목씩 짚는다.
6. **거기서 멈춘다.** zip을 어디에도 올리거나 제출하지 않는다. 이렇게 말한다: "미니앱과 zip이 준비됐어요. DoU에
   제출하는 창구는 아직 준비 중이에요." `MINIAPP.md`에서 3단계를 끝남으로 표시한다.
