> English: [README.md](./README.md) — 영어판이 정본입니다. 두 판이 다르면 영어판을 따르세요.

# chatic-apps-devtools

Chatic 앱 페이지(`chatic-apps-sdk`로 만든 미니앱)의 검증기입니다. 작성자는 페이지를 넘기기 전에 명령 하나,
`verify`만 돌립니다. 페이지를 점검하고, 빌드한 페이지를 앱 대역 위에서 시험해 본 뒤, 무엇이 문제이고 어떻게 고치는지
쉬운 말로 알려 줍니다. 이 패키지는 페이지의 일부가 아니며, 페이지의 런타임 의존성은 여전히 SDK 하나뿐입니다.

## `verify`

프로젝트의 스크립트에 넣고, 빌드한 뒤 돌립니다.

```json
{ "scripts": { "verify": "chatic-apps verify" } }
```

```bash
npm run build
npm run verify
```

스크립트 없이 부를 때는 패키지의 전체 이름으로 부릅니다: `npx @lemoncloud/chatic-apps-devtools verify`. 그냥
`npx chatic-apps`로 부르지 마세요. 이 패키지가 설치되지 않은 곳에서는 npm이 그 이름을 가진 다른 패키지를 받아 오며,
그것은 이 패키지가 아닙니다.

```text
Chatic 앱 검사

✓ 매니페스트
✗ 권한
  • "share" 권한이 필요한 기능을 쓰는데 요청하지 않았습니다 (src/app.ts:212) → 매니페스트의 permissions에 "share" 권한을 넣으세요
✓ 코드
✓ 번들
✓ 시작
✓ 뒤로가기와 닫기
…

화면 이동 검사는 건너뛰었습니다: 화면마다 뒤로가기와 정리를 검사하려면 chatic-apps.scenarios.ts를 두세요.
번들: 파일 4개, 23.0 KB.

✗ 고칠 것 1개.
```

- **고칠 것은 한 줄에 하나**: 무엇이 문제인가 → 어떻게 고치나, 그리고 파일과 줄 또는 화면. 고칠 것이 없는 묶음은 ✓ 한 줄로
  접힙니다.
- **영어 또는 한국어**로 시스템 언어(`LC_ALL`, `LC_MESSAGES`, `LANG`)를 따릅니다. `--lang en`이나 `--lang ko`로
  고릅니다.
- **`--details`**는 줄마다 그 뒤의 규칙이나 시나리오 이름을 덧붙이고, **`--json`**은 전부를 데이터로 출력합니다.
- **빌드 폴더는 `dist/`**입니다. 다른 폴더면 `--dist`로, 프로젝트 폴더는 `--root`로 알려 줍니다.
- **설정이 필요 없습니다.** 시나리오 파일이 없으면 화면 정보가 필요 없는 동작 검사(시작, 첫 화면 뒤로가기, 닫기, 테마,
  숨김과 복귀, 동의 거절, 클라우드 변경, 한도 초과)만 돌리고, 시나리오 파일을 두면 화면 검사가 더해진다고 알려 줍니다.
  아직 빌드하지 않았으면 먼저 빌드하라고 알려 줍니다.
- 고칠 것이 없으면 `0`, 있으면 `1`로 끝납니다.

이 패키지는 아직 배포되지 않았습니다. 배포 매니페스트는 `package.publish.json`(`@lemoncloud/chatic-apps-devtools`,
명령 `chatic-apps`)입니다. SDK의 배포 경로가 출처 증명이 붙는 CI 배포로 바뀐 뒤에 싣습니다. 작성자의 컴퓨터에서 도는
명령은 라이브러리보다 공격자에게 더 값진 표적이기 때문입니다.

## `bundle`

`chatic-apps bundle`은 빌드 폴더를 넘길 zip으로 묶습니다: 폴더의 내용을 압축 파일 맨 위에(`index.html`,
`.well-known/chatic-app.json`, `assets/…`) 넣고, 그 밖의 것은 넣지 않습니다. `verify`처럼 프로젝트의 `bundle`
스크립트로 둡니다. `--out`으로 다른 파일을 지정하지 않으면 `<프로젝트 폴더>.zip`을 쓰고, 빌드되지 않았거나 링크가 있는
폴더는 거절하며, 같은 빌드는 같은 바이트로 묶습니다 — 항목을 정렬하고 날짜를 1980-01-01로 둡니다. 다른 것은
점검하지 않으므로 `verify`를 먼저 돌리세요.

## 안쪽: `check`와 `scenarios`

`verify`는 점검기 다음에 시나리오 실행기를 돌립니다. 둘 다 따로 쓰는 명령으로도 남아 있습니다. CI용이고, 규칙 이름이
붙은 날것의 출력이 필요한 사람을 위한 것입니다.

```bash
npx nx build @chatic/chatic-apps-devtools          # into dist/libs/chatic-apps-devtools
node dist/libs/chatic-apps-devtools/cli.js verify    --root <page> [--dist <built folder>]
node dist/libs/chatic-apps-devtools/cli.js check     --root <page> --dist <built folder>
node dist/libs/chatic-apps-devtools/cli.js scenarios --root <page> --dist <built folder> [--mock <module>]
```

셋 다 실패하면 `1`, 통과하면 `0`으로 끝나고, `--json`을 붙이면 데이터로 출력합니다. `verify`가 출력하는 쉬운 말
메시지는 `src/i18n/`(`en.ts`, `ko.ts`)에 있고, 모든 규칙과 모든 시나리오 문제를 키로 갖습니다. 메시지 없이 더한 규칙은
컴파일되지 않습니다.

이 도구들은 이 저장소 밖에 둔 기준 미니앱으로 검증됩니다. 작성자의 프로젝트와 같은 모양입니다: 이 패키지와 SDK를
패키지로 설치하고, `verify`를 통과하며, 그 시험이 일부러 미니앱을 깨뜨려 — 점검 규칙마다 하나씩, 그리고 페이지가 흔히
틀리는 시나리오마다 — 검사마다 제 경우를 잡는지 보입니다. 이 저장소에는 페이지가 하나도 없습니다.

### `check`

매니페스트, 소스(`src/`와 `index.html`), 빌드한 번들(기본은 `dist/`)을 읽습니다. 페이지를 돌리지는 않습니다.

| 규칙                          | 지키는 것                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `manifest/missing`            | `.well-known/chatic-app.json`이 있다(번들의 사본이 `public/`보다 우선한다)       |
| `manifest/invalid`            | JSON 객체이고, `permissions`는 배열이다                                          |
| `manifest/version`            | `manifestVersion`이 `1`이다                                                      |
| `manifest/name`               | `name`이 1~100자다                                                               |
| `manifest/unknown-field`      | 모든 항목을 앱이 읽는다                                                          |
| `manifest/unknown-permission` | 모든 권한을 앱이 안다                                                            |
| `manifest/display`            | `display`가 `clean`, `titled`, `immersive` 중 하나다                             |
| `manifest/orientation`        | `orientation`이 `any`, `portrait`, `landscape` 중 하나다                         |
| `manifest/unused-permission`  | 요청한 권한은 모두 소스 어딘가에서 쓴다                                          |
| `manifest/missing-permission` | 권한이 필요한 호출은 모두 그 권한을 요청했다                                     |
| `code/unknown-data-method`    | 따옴표 안의 클라우드 데이터 메서드 이름은 SDK가 타입을 갖고 있는 것이다          |
| `code/local-storage`          | `localStorage`를 쓰지 않는다                                                     |
| `code/os-theme`               | 코드와 CSS 모두에서 `prefers-color-scheme`를 쓰지 않는다                         |
| `code/history-routing`        | `pushState`/`replaceState`, 해시 경로, `popstate`, 브라우저 · 해시 라우터가 없다 |
| `code/popup`                  | `window.open`이나 `window.opener`를 쓰지 않는다                                  |
| `code/version-compare`        | `appVersion`/`protocolVersion`을 비교하지 않는다                                 |
| `code/error-message`          | 오류의 `message`로 분기하지 않는다                                               |
| `bundle/missing`              | 번들 폴더가 있다                                                                 |
| `bundle/layout`               | 맨 위에 `index.html`과 매니페스트가 있고, `index.html`은 빌드된 것이다           |
| `bundle/build-output-only`    | 소스, 소스 맵, 패키지 파일, 숨김 파일이 없다                                     |
| `bundle/mock`                 | SDK의 mock이 프로덕션 번들에 없다                                                |

코드 규칙은 주석을 비운 소스를 읽으므로, 금지된 것을 이름으로 언급한 주석에는 걸리지 않습니다. 파서가 아니라 패턴이라서
특이하게 쓴 위반은 놓칠 수 있고, 금지된 이름을 언급만 한 문자열에 걸릴 수 있습니다.

**쓰는 권한**은 권한이 필요한 호출(`copy`, `share`, `openUrl`, `getUserKey`, `data.sendMessage`, `data.session`,
플레이스 프로필 도우미)을 SDK나 그 타입을 가져오는 파일에서만 찾고, 따옴표 안의 데이터 메서드 이름에서도 찾습니다.
메서드마다의 권한은 SDK의 `DataCalls`와 `DataStreams` 타입을 키로 하는 표에서 나옵니다. SDK가 메서드를 더하거나
빼면 여기서 컴파일이 깨집니다.

**네트워크 대상**은 나열만 하고 실패로 치지 않습니다: 소스의 `fetch`, `WebSocket`, `EventSource`,
`XMLHttpRequest.open`, `sendBeacon`, `axios`, 원격 `import()`, 그리고 번들 스크립트에 적힌 모든 호스트(외부
라이브러리의 호출은 여기서 드러납니다). 앱은 페이지가 클라우드에서 읽은 값을 거르지 않으므로, 페이지가 무엇을 어디로
보내는지는 작성자가 살필 몫입니다.

**번들 크기**는 파일 종류별로 출력합니다. 작성자와 릴리스 기록을 위한 것입니다.

### `scenarios`

빌드한 페이지를 SDK의 앱 mock 위에 열고, 사용자와 앱이 페이지에 하는 일을 걸어 봅니다. 브라우저 없이 돕니다:
창은 [jsdom](https://github.com/jsdom/jsdom)이, 페이지의 ES 모듈 스크립트를 클래식 스크립트 하나로 바꾸는 일은
esbuild가 합니다(jsdom은 모듈을 돌리지 못합니다). 그래서 설치는 패키지 둘이고 브라우저 내려받기가 없습니다. 대신
아무것도 배치하거나 그리지 않으므로 레이아웃, 안전 영역, 실제 터치는 여기서 시험하지 않습니다. 실행기는 앱이나 서버에
닿지 않습니다.

| 시나리오          | 실패하는 경우                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `start`           | 페이지가 오류를 던지거나, 연결하지 않거나, 데이터 권한이 있는데 `apps.data.connect()`를 부르지 않거나, 첫 화면에서 뒤로가기를 쥘 때            |
| `screens`         | 화면이 Android 뒤로가기를 쥐지 않거나, 뒤로가기가 첫 화면으로 돌아오지 않거나, 뒤로간 뒤 스트림 · 오래 사는 객체의 리스너 · interval이 남을 때 |
| `back-at-root`    | 첫 화면에서 Android 뒤로가기가 페이지를 닫지 않을 때                                                                                           |
| `close-guard`     | 3초 안의 두 번째 닫기가 닫지 않을 때                                                                                                           |
| `theme`           | 앱의 테마가 바뀌어도 페이지가 바뀌지 않을 때                                                                                                   |
| `hide-resume`     | 저장소를 쓰는 페이지가 숨겨질 때 저장하지 않거나, 다시 보일 때 깨질 때                                                                         |
| `actions`         | 동작이 오류를 던지거나 보고할 때                                                                                                               |
| `device-refused`  | 카메라와 마이크가 막힌 상태에서 동작이 오류를 던지거나 보고할 때                                                                               |
| `consent-refused` | 사용자가 클라우드 데이터를 거절하면 페이지가 오류를 던지거나 다시 물을 때                                                                      |
| `cloud-change`    | 스트림이 열린 채 남거나, 스트림이 열려 있던 페이지가 반응하지 않거나, 계속 데이터를 요청할 때                                                  |
| `big-list`        | 5,000행 목록에서 화면이 요소를 2,000개 넘게 그릴 때                                                                                            |
| `rate-limited`    | `RATE_LIMITED`로 거절된 읽기를 다시 시도하지 않을 때                                                                                           |

오류는 페이지가 던진 것(동기로, 이벤트 리스너에서, 처리하지 않은 rejection으로)과 `reportError`로 보고한 것입니다.
스트림은 오가는 메시지로 셉니다: 구독해서 답을 받은 것에서 구독 해제한 것과 앱이 끝낸 것을 뺍니다. 리스너는 창, 문서,
그 밖에 화면보다 오래 사는 객체에서 셉니다. 요소 자체의 리스너는 요소와 함께 사라지므로 세지 않습니다.

적용되지 않는 시나리오 — 데이터 권한이 없거나, 화면이나 동작을 적지 않은 경우 — 는 돌지 않았다고 알립니다.

#### 시나리오 파일

실행기는 프로젝트 루트의 `chatic-apps.scenarios.ts`(또는 `.mts`, `.js`, `.mjs`)에서 페이지의 화면과 데이터를
배웁니다. 기본 내보내기는 이렇습니다.

```ts
import type { ScenarioConfig } from '@lemoncloud/chatic-apps-devtools';

import { mockData } from './src/mockData';

export default {
    data: mockData, // what the mock answers: the page's own development data
    ready: '[data-action="done"]', // present once the page has started
    screens: [
        { name: 'rooms', open: ['[data-action="rooms"]'] }, // each click opens one screen
        { name: 'members', open: ['[data-action="members"]'], tap: ['[data-action="member"]'] },
    ],
    actions: [{ name: 'share', click: '[data-action="share"]' }],
} satisfies ScenarioConfig;
```

권한은 번들의 매니페스트에서 가져옵니다. mock은 프로젝트에 설치된 SDK(`@lemoncloud/chatic-apps-sdk/mock`)에서
가져오고, `--mock`으로 다른 모듈을 지정할 수 있습니다. 이 저장소는 SDK의 워크스페이스 이름인
`@chatic/chatic-apps-sdk/mock`을 씁니다.

## API

`verify`, `formatVerify`, `bundle`이 명령들의 API입니다. `check`, `runScenarios`, `loadDist`, `loadEntry`, `openPage`,
`loadScenarioConfig`는 시험용으로 내보냅니다. `loadEntry`는 페이지를 소스에서 프로덕션 빌드처럼(`import.meta.env.DEV`가
false) 묶고, 소스를 바꾸는 함수를 받을 수 있습니다. 페이지의 시험이 일부러 깨뜨린 사본을 만드는 방법입니다.
`openPage`는 페이지를 열기 전에 호스트 — mock이든 실제 호스트든 — 를 끼워 넣는 고리를 받습니다.

빌드는 이 API의 선언 파일 하나, `index.d.ts`를 `index.js`, `cli.js` 옆에 씁니다.

## 시험

여기의 시험은 페이지가 필요 없는 부분을 봅니다: 코드 규칙이 읽는 주석 지우기, SDK 메서드와 맞춘 권한 표, 두 언어의
모든 메시지, 언어 고르기, 시나리오 파일 없이 도는 시나리오, 출력 모양, 빈 폴더에서의 `verify`, 그리고 이 README와
한국어판(`README.ko.md`)의 짝 — 같은 제목과 코드 블록, 서로를 가리키는 첫 줄 — 을 SDK의 짝 검사로 봅니다. 검사 자체는
이 저장소 밖의 기준 미니앱에서 시험합니다.

시험 실행기(jest, `node --test`)는 페이지의 처리하지 않은 rejection을 스스로 가로채 시험을 실패시키므로, 그 경우는
실행기 아래에서는 보이지 않습니다. 명령은 그냥 Node에서 돌 때 이를 문제로 알립니다.
