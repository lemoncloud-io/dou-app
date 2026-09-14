# ADR-0084: 앱 로컬 실행을 도입하고 env 파일 의미와 셸 stage 어휘를 리포 전체와 통일한다

> 상태: Accepted · 결정일: 2026-09-14
> 범위: `apps/mobile` (env · 딥링크 · 주입 · `project.pbxproj` · `*.xcscheme`) ·
> `libs/device-utils` · 루트 `package.json` 스크립트 ·
> `apps/mobile/android/app/src/main/res/xml/network_security_config.xml` ·
> `apps/mobile/docs/webview-debugging.md`
> 관련: [ADR-0080](./0080-debug-panel-shared-model-and-stage-visibility.md) (결정 13 — 런타임 웹 주소
> 스위처 삭제. **이 문서는 그 결정을 뒤집지 않고 유지한다**) ·
> [ADR-0079](./0079-config-registry-and-lane-resolver.md) (설정 레지스트리 · 결정 14의 어휘 정규화) ·
> [ADR-0077](./0077-register-push-device-once-per-install.md) (푸시 디바이스 등록)

## 맥락 (Context)

### 앱에는 로컬 실행이 없다

앱은 네이티브 셸 + WebView다. 웹뷰가 볼 주소는 `VITE_WEBVIEW_BASE_URL`이고, 이 값은 네이티브 빌드
시점에 react-native-config로 구워진다. 읽는 파일이 플랫폼마다 다르다.

| 플랫폼  | 읽는 파일                | 근거                                                                   |
| ------- | ------------------------ | ---------------------------------------------------------------------- |
| iOS     | `apps/mobile/.env`       | react-native-config 기본값 (`ReadDotEnv.rb`)                           |
| Android | `.env.dev` / `.env.prod` | `android/app/build.gradle`의 `project.ext.envConfigFiles` (플레이버별) |

웹은 `yarn web:start` 한 줄로 로컬이 뜬다. 데스크톱도 짝이 있다 — `desktop:start:local`이
`concurrently`로 desktop-web dev 서버(5005)와 Electron을 같이 띄우고
`MAIN_VITE_DESKTOP_WEB_URL=http://localhost:5005`로 로컬을 가리킨다. **모바일만 이 짝이 없다.**

### 지금 쓰는 우회로가 리포에 흔적을 남겼다

로컬 웹에 붙이려면 오늘은 `.env`(iOS) / `.env.dev`(Android)에 자기 LAN IP를 직접 적고, Android면
`network_security_config.xml`에도 그 IP를 추가한 뒤 네이티브를 다시 빌드해야 한다. 그 결과가 그대로
커밋돼 있다.

```xml
<domain includeSubdomains="true">192.168.1.13</domain>
<domain includeSubdomains="true">192.168.1.129:5003</domain>
<domain includeSubdomains="true">192.168.1.129</domain>
```

`apps/mobile/docs/webview-debugging.md:75`에도 `192.168.1.129:5003`이 예시로 박혀 있다.

### env 파일의 의미가 web 계열과 다르다

web · desktop-web · admin-v2는 셋 다 같은 규칙을 쓴다.

| 파일           | 의미        | 근거                                                       |
| -------------- | ----------- | ---------------------------------------------------------- |
| `.env`         | **로컬**    | `<app>:start`가 읽는 것. `.env.example`이 `VITE_ENV=LOCAL` |
| `.env.dev`     | dev 빌드    | `project.json`의 `fileReplacements`로 갈아끼운다           |
| `.env.prod`    | prod 빌드   | 같음                                                       |
| `.env.example` | 로컬 템플릿 | 그래서 `VITE_HOST=http://localhost:5003`이 들어 있다       |

**mobile만 `.env`를 dev용으로 쓴다.** `apps/mobile/.env.example`은 `VITE_ENV=DEV`다. 그리고 같은
"dev 빌드"인데 플랫폼이 서로 다른 파일을 읽는다 — iOS는 `.env`, Android는 `.env.dev`. iOS가
react-native-config의 기본값에 얹혀 있어서 생긴 차이지 의도된 설계가 아니다.

Android에서 `.env`는 어느 플레이버도 매핑하지 않으므로 **이미 비어 있는 자리**다.

### 셸은 백엔드를 모른다

네이티브 셸이 `react-native-config`에서 읽는 키는 7개뿐이고, **백엔드 엔드포인트는 하나도 없다.**

| 키                          | 횟수 | 쓰임                                        |
| --------------------------- | ---- | ------------------------------------------- |
| `VITE_ENV`                  | 5    | 딥링크 스킴 · customZip 게이트 · stage 주입 |
| `VIEW_APP_NAME`             | 2    | 앱 표시 이름                                |
| `VITE_WEBVIEW_BASE_URL`     | 1    | 웹뷰가 볼 주소                              |
| IAP SKU · plan              | 3    | 인앱결제                                    |
| `VITE_GOOGLE_WEB_CLIENT_ID` | 1    | 구글 로그인                                 |

백엔드와 말하는 건 전부 웹이고, 웹은 자기 `import.meta.env`를 읽는다
(`apps/web/src/app/config/adapters.ts:15`). **그래서 "로컬 실행이 어느 백엔드를 향하나"는 앱 트랙의
결정이 아니다** — `apps/web/.env`가 정하고, 앱은 그 웹을 보기만 한다.

`VITE_WS_ENDPOINT`는 타입 선언 두 곳(`src/types/react-native-config.d.ts`, `src/types/env.d.ts`)과
`.env.example`에만 있고 읽는 코드가 없다. 죽은 항목이다.

### 딥링크 스킴은 빌드 설정이 등록하는데, 런타임이 그 매핑을 한 벌 더 갖고 있다

OS에 등록되는 스킴은 **빌드 설정**이 정한다.

| 플랫폼  | 등록 주체                                            | dev          | prod     |
| ------- | ---------------------------------------------------- | ------------ | -------- |
| iOS     | `APP_URL_SCHEME` 빌드 세팅 (`project.pbxproj`)       | `chatic-dev` | `chatic` |
| Android | 플레이버별 `appScheme` 플레이스홀더 (`build.gradle`) | `chatic-dev` | `chatic` |

그런데 런타임 코드는 같은 매핑을 **env 파일 기준으로** 한 번 더 계산한다.

```ts
// DeeplinkService.ts:35 · deeplinkUtils.ts:402 — 같은 로직 두 벌
const scheme = Config.VITE_ENV === 'DEV' ? 'chatic-dev' : 'chatic';
```

두 출처가 지금은 우연히 일치한다. env 파일이 값을 두 개(`DEV` · `PROD`)만 갖고, 그 둘이 빌드 설정
두 개와 관례로 짝지어져 있기 때문이다. Android는 `envConfigFiles`가 그 짝을 실제로 강제하지만,
iOS는 개발자가 `.env`에 `DEV`를 넣어 두는 관례일 뿐 배선이 아니다. **세 번째 값이 들어오는 순간
깨진다** — dev 빌드 설정 + `VITE_ENV=LOCAL`이면 OS는 `chatic-dev`를 등록했는데 런타임은 `chatic`을
계산한다.

같은 파일 계열의 `isCustomZipAllowed`는 이미 반대 극성(`!== 'PROD'`)을 쓴다. 두 게이트가 같은 질문에
다른 극성으로 답하고 있다.

### stage 주입은 어느 셸에서도 먹지 않는다

셸은 `window.CHATIC_APP_STAGE`를 주입한다. 웹의 `webEnvAdapter.stage()`는 `'local'` · `'stage'` ·
`'prod'` 세 소문자 값만 매칭한다 (`libs/config/src/adapters/webEnvAdapter.ts:46`).

| 셸       | 주입값                                        | 매칭 | 결과                  |
| -------- | --------------------------------------------- | ---- | --------------------- |
| 모바일   | `'DEV'` / `'PROD'` (`injectionScripts.ts:95`) | 없음 | `buildStage()`로 폴백 |
| 데스크톱 | `'dev'` (`preload/index.ts:26`)               | 없음 | `buildStage()`로 폴백 |

**모바일만의 문제가 아니다. 셋 다 어긋나 있다.** `Env` 타입(`libs/app-messages`)은
`'local' | 'stage' | 'prod'`인데 데스크톱이 쓰는 `'dev'`는 그 유니온에 아예 없다.

어긋남이 안 드러난 이유는 소비자가 하나뿐이라서다. `libs/device-utils`의 `deviceInfoStore.ts:40`만
`as Env` 캐스팅으로 날것을 받는다. 타입 단언이 컴파일 에러를 지우고 있었다.

### 이 값은 데스크톱에서만 푸시로 나간다

서버는 stage로 SNS 플랫폼 애플리케이션 이름을 조립한다 — `<platform>-<application>-<stage>`
(`@lemoncloud/chatic-pushes-api`의 `ApplicationModel`). 그래서 어휘를 바꾸면 푸시가 깨질 수 있다.
다만 **누가 이 값을 보내는지가 플랫폼마다 다르다.**

| 경로                                                               | stage를 보내는가                                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| 모바일 (`apps/web/.../useDeviceTokenRegistration.ts:45`)           | **아니다** — "deliberately NOT sent". 플레이버의 `google-services.json`이 스테이지를 나른다 |
| 데스크톱 (`apps/desktop-web/.../useDeviceTokenRegistration.ts:48`) | **그렇다** — `window.CHATIC_APP_STAGE`를 `deviceInfoStore`를 거치지 않고 그대로             |

그리고 브로커의 어휘는 `Env`가 아니다. `docs/specs/cross-cloud-push.md:63`이 SNS 플랫폼 앱을
`chatic-desktop-{dev,prod}` 둘로 못박는다 — **`-stage`는 존재하지 않는다.**

`deviceInfoStore.stage`의 소비자는 표시용 두 곳뿐이다(피드백 리포트 · 디버그 패널 행).

### 제약

- **ADR-0080 결정 13.** 런타임 웹 주소 스위처(`EnvironmentSettingsScreen`)는 2026-09-10에 의도적으로
  삭제됐다. `ConfigKvService`의 클래스 주석은 "이걸 다시 노출하지 말라, 쓰기 가능한
  `debug.webviewBaseUrl` 키도 만들지 말라"고 못박아 뒀다.
- **웹 dev 서버는 `localhost`에만 바인딩된다** (`apps/web/vite.config.mts`의 `server.host`).
- **iOS ATS 예외는 `localhost`뿐이다** (`Info.plist`). LAN IP로 http를 물면 시뮬레이터는 통과하고
  실기기는 차단된다.
- **`ENVFILE` 환경변수는 양 플랫폼에서 동작한다.** Android는 `envConfigFiles`보다 우선하고
  (`dotenv.gradle:27`), iOS는 `ENV['ENVFILE']`을 읽는다 (`ReadDotEnv.rb`).
- **iOS의 `/tmp/envfile`이 `ENVFILE`을 무력화한다.** `ReadDotEnv.rb`가 이 파일을 **먼저** 보는데,
  커밋된 두 스킴(`Chatic.xcscheme` · `Chatic Dev.xcscheme`)의 build pre-action이 매 빌드마다 이걸
  쓴다. 같은 pre-action이 `cp .env.dev .env`로 **개발자의 `.env`를 덮어쓰기까지 한다.**
- **react-native-config 코덴 페이즈는 `always_out_of_date: "1"`이다** (podspec). env 파일을 바꿔도
  Xcode가 페이즈를 건너뛰지 않는다.
- **GUI 빌드는 셸 환경변수를 못 받는다.** Android Studio / Xcode에서 직접 빌드하면 `ENVFILE`이 없다.
  Android는 `envConfigFiles`가 플레이버로 받아내지만, **iOS에는 그런 장치가 없다.**
- **xcodebuild 명령행 build setting이 가장 세다.** `run-ios --extraParams "ENVFILE=..."`로 넘기면
  프로젝트의 build setting을 이긴다. nx 실행기 스키마에도 `extraParams`가 있다.
- **웹이 앱보다 먼저 배포된다.** 앱 배포는 되돌리기 어렵다.

## 결정 (Decision)

### 1. 로컬 실행은 빌드타임이다 — 런타임 스위처를 되살리지 않는다

웹뷰 주소는 계속 빌드 시점에 구워진다. 바꾸는 건 "어느 env 파일을 굽느냐"뿐이다. ADR-0080 결정 13은
그대로 선다. `setWebviewBaseUrlOverride`는 호출자 없는 상태로 남고, 쓰기 가능한
`debug.webviewBaseUrl` 레지스트리 키도 만들지 않는다.

주소를 바꾸려면 재빌드해야 한다. 이건 이 결정이 감수하는 비용이지 결함이 아니다.

### 2. 대상은 iOS 시뮬레이터와 Android 에뮬레이터다

실기기는 이번 범위 밖이다. LAN IP · iOS ATS 예외 추가 · Android cleartext 허용이 전부 따라붙는데,
그 셋이 바로 지금 리포를 더럽힌 원인이다.

### 3. 주소는 양 플랫폼 모두 `http://localhost:5003`이다

Android 에뮬레이터는 `adb reverse tcp:5003 tcp:5003`으로 붙는다. `10.0.2.2`를 쓰지 않는다.

이 선택의 값어치는 **주소가 플랫폼 간 같아진다**는 데 있다. `.env`가 한 벌로 끝나고, 실기기로
넓힐 때도 그대로 간다. 그리고 `adb reverse`는 기기의 루프백을 **호스트의 루프백**으로 넘기므로
**웹 dev 서버 설정을 건드릴 필요가 없다** — `host: 'localhost'` 그대로 닿는다.

`network_security_config.xml`의 `localhost` 항목과 iOS ATS의 `localhost` 예외가 이미 있어서
네이티브 설정 추가도 없다.

`adb reverse`는 기기 재연결마다 날아간다. 그래서 스크립트가 앱 실행 직전에 매번 건다(결정 7).

### 4. 앱에 `VITE_ENV=LOCAL`을 도입한다

`Stage`는 이미 `'LOCAL' | 'DEV' | 'PROD'` 세 개고 웹은 로컬에서 `LOCAL`을 쓴다. 앱만 그 값이 없는 게
어긋난 상태였다.

딥링크 스킴 분기 두 곳의 극성을 뒤집는다.

```ts
// before — 세 번째 값이 들어오면 빌드 설정과 어긋난다
const scheme = Config.VITE_ENV === 'DEV' ? 'chatic-dev' : 'chatic';
// after — 빌드 설정의 실제 등록과 일치하고, isCustomZipAllowed와 극성이 같아진다
const scheme = Config.VITE_ENV === 'PROD' ? 'chatic' : 'chatic-dev';
```

`isCustomZipAllowed`(`!== 'PROD'`)는 그대로 두면 `LOCAL`을 통과시킨다. 수정 없다.

### 5. env 파일의 의미를 web 계열과 통일한다 — `.env`가 로컬이다

새 파일을 만들지 않는다. 세 파일의 의미를 web · desktop-web · admin-v2와 같게 맞춘다.

| 파일           | 의미        | mobile 현재                    | 변경 후                                                                     |
| -------------- | ----------- | ------------------------------ | --------------------------------------------------------------------------- |
| `.env`         | 로컬        | iOS의 dev용 (Android은 미사용) | **로컬** — `VITE_ENV=LOCAL` · `VITE_WEBVIEW_BASE_URL=http://localhost:5003` |
| `.env.dev`     | dev 빌드    | Android dev 플레이버만         | **양 플랫폼** dev 빌드                                                      |
| `.env.prod`    | prod 빌드   | Android prod 플레이버만        | **양 플랫폼** prod 빌드                                                     |
| `.env.example` | 로컬 템플릿 | dev 템플릿 (`VITE_ENV=DEV`)    | **로컬 템플릿** (`VITE_ENV=LOCAL`)                                          |

`.env`는 개발자가 `.env.example`을 복사해 한 번 만든다. `apps/web/.env`를 만드는 것과 똑같은
동작이다. 파생 생성 스크립트를 만들지 않는다 — web이 안 하는 일을 mobile만 하면 그게 다시 어긋남이다.

이 결정의 부수 효과가 하나 있다. **iOS의 dev/prod 빌드가 `.env` 대신 `.env.dev` / `.env.prod`를
읽게 된다.** 같은 dev 빌드에 플랫폼마다 다른 파일이 물리던 것이 없어진다. 기존 iOS 개발자는 지금
`.env`에 넣어둔 dev 설정을 `.env.dev`로 한 번 옮겨야 한다.

### 6. 어느 env를 읽을지는 빌드 설정이 정한다 — 로컬만 명령행으로 덮는다

GUI 빌드(Android Studio · Xcode)는 셸 환경변수를 못 받는다(§제약). 그래서 매핑을 스크립트가 아니라
빌드 설정에 둔다. Android는 이미 그렇게 하고 있고, iOS에 같은 것을 만든다.

| 플랫폼  | 매핑 주체                                          | dev        | prod        |
| ------- | -------------------------------------------------- | ---------- | ----------- |
| Android | `envConfigFiles` (`build.gradle`) — **변경 없음**  | `.env.dev` | `.env.prod` |
| iOS     | configuration별 `ENVFILE` build setting — **신설** | `.env.dev` | `.env.prod` |

iOS의 `ENVFILE`은 `APP_URL_SCHEME`이 이미 앉아 있는 그 자리(configuration별 `buildSettings`)에 둔다.
스킴을 등록하는 것과 env를 고르는 것이 같은 축에 있게 되고, 결정 4가 지적한 "빌드 설정과 런타임에
매핑이 두 벌" 문제를 더 만들지 않는다.

로컬 실행만 이 매핑을 덮는다.

| 플랫폼  | 덮는 방법                              | 근거                                           |
| ------- | -------------------------------------- | ---------------------------------------------- |
| iOS     | `run-ios --extraParams "ENVFILE=.env"` | 명령행 build setting이 가장 세다               |
| Android | `ENVFILE=.env` 환경변수                | `envConfigFiles`보다 우선 (`dotenv.gradle:27`) |

`mobile:ios:dev` 같은 기존 스크립트에는 `ENVFILE`을 넣지 않는다. 빌드 설정이 이미 정하므로, 넣으면
같은 사실이 두 곳에 생긴다.

**두 스킴의 build pre-action을 삭제한다.** `Chatic.xcscheme` · `Chatic Dev.xcscheme`이 매 빌드마다
`/tmp/envfile`을 쓰고 `cp .env.dev .env`로 개발자의 `.env`를 덮어쓰고 있었다(§제약). 그게 지금까지
"스킴별로 어느 env를 읽나"를 담당하던 장치인데, 새 `ENVFILE` build setting이 같은 스킴→configuration
매핑을 **`.env`를 건드리지 않고** 해낸다. pre-action이 남아 있으면 `/tmp/envfile`이 `ENVFILE`을
이겨서 이 결정 전체가 죽은 코드가 되고, `.env`=로컬이라는 결정 5도 첫 빌드에 지워진다.

그 뒤로 `/tmp/envfile`은 어떤 경로로도 만들지 않는다.

### 7. 스크립트는 플랫폼별 풀 세트다

`mobile:ios:local`과 `mobile:android:local` 두 개다. 각각 순서대로 한다.

1. `apps/mobile/.env` 존재 확인 — 없으면 `.env.example` 복사를 안내하고 멈춘다
2. (Android만) `adb reverse tcp:5003 tcp:5003`
3. 웹 dev 서버(5003)와 Metro를 `concurrently`로 기동
4. 결정 6의 override로 네이티브 빌드·설치

`adb reverse`가 앱 실행 전에 걸려야 하고 기기 재연결마다 날아가므로, 스크립트가 앱 실행까지 쥔다.
서버만 띄우는 별도 스크립트는 만들지 않는다 — `adb reverse` 타이밍을 사람이 지켜야 하는 형태가 된다.

이름은 mobile 계열의 문법(`mobile:<platform>:<stage>`)을 그대로 쓴다. web의 `start`는 verb 슬롯인데
mobile 계열에는 verb 자리가 없어 옮겨올 데가 없다. 통일의 실질은 **stage 어휘가 `Stage` 타입의 세
값과 1:1이 되는 것**이다 — web은 `start` / `build:dev` / `build:prod`, mobile은 `ios:local` /
`ios:dev` / `ios:prod`. env 파일 세 개와도 1:1이 된다(결정 5).

`mobile:start`(Metro)는 건드리지 않는다. web의 `web:start`와 의미가 다르지만(한쪽은 앱이 뜨고
한쪽은 번들러만 뜬다), 이름을 바꾸면 기존 워크플로가 깨진다. 이 트랙이 감당할 일이 아니다.

### 8. `network_security_config.xml`의 개인 IP를 지운다

`192.168.1.13` · `192.168.1.129` · `192.168.1.129:5003` 세 항목을 삭제한다. 결정 3으로 `localhost`만
있으면 되므로 전부 죽은 항목이 된다. `webview-debugging.md:75`의 예시도 `localhost:5003`으로 고친다.

S3 도메인 항목은 남긴다 — customZip 다운로드 경로다.

### 9. `CHATIC_APP_STAGE` 어휘를 통일한다

**모바일의 주입값만 `Env` 어휘(`'local' | 'stage' | 'prod'`)로 맞추고, 데스크톱은 건드리지 않는다.**

| 셸       | 현재                       | 변경 후                          | 이유                                                |
| -------- | -------------------------- | -------------------------------- | --------------------------------------------------- |
| 모바일   | `'LOCAL'`/`'DEV'`/`'PROD'` | `'local'` / `'stage'` / `'prod'` | 푸시로 안 나가므로 바꿔도 안전하다                  |
| 데스크톱 | `'dev'` / `'prod'`         | **그대로**                       | 이 값이 곧 SNS 앱 이름이다 — `-stage`는 서버에 없다 |

데스크톱을 `'stage'`로 바꾸면 dev 채널 설치가 존재하지 않는 `chatic-desktop-stage`에 등록되고,
FCM 자격증명이 어긋나 SENDER_ID_MISMATCH로 전달이 끊긴다(`docs/specs/cross-cloud-push.md:63`).
어휘 통일보다 푸시가 사는 게 먼저다.

대신 **읽는 쪽이 세 어휘를 전부 흡수한다.** `deviceInfoStore.ts`의 `as Env` 캐스팅을 매핑 테이블로
바꿔 `Env` 정규값 · 데스크톱의 `'dev'` · 구버전 모바일의 대문자를 모두 받는다. 구버전 행은 선택이
아니다 — 웹이 앱보다 먼저 배포되므로, 없으면 새 웹이 기존 설치 전부를 `'local'`로 잘못 적는다.

**푸시로 나가는 문자열은 하나도 바뀌지 않는다.** 모바일은 stage를 안 보내고, 데스크톱은 이 결정의
범위 밖이다(§맥락).

바뀌는 것은 주입값이 처음으로 `webEnvAdapter.stage()`에 매칭된다는 점이다. 스테이지가 일치하는
조합은 결과가 같다.

| 조합                 | 지금  | 변경 후 |
| -------------------- | ----- | ------- |
| dev 앱 + dev 웹      | DEV   | DEV     |
| prod 앱 + prod 웹    | PROD  | PROD    |
| local 앱 + local 웹  | LOCAL | LOCAL   |
| **dev 앱 + 로컬 웹** | LOCAL | **DEV** |

마지막 줄만 뒤집힌다. 지금 `.env`에 LAN IP만 박아 손으로 로컬에 붙이던 방식이 그것이고, 결정 7의
스크립트로 대체되므로 남겨둘 이유가 없다.

> 주입값이 효력을 갖는다는 건 페이지 JS가 `window.CHATIC_APP_STAGE`를 덮어 transport project를
> `_local`로 돌릴 수 있게 된다는 뜻이기도 하다. 그 시점엔 이미 임의 JS 실행 권한이 있는 상태이고,
> 보안 게이트인 `debug.*` 키는 주입값이 아니라 `buildStage()`를 읽으므로(ADR-0079 결정 5) 영향이
> 없다.

### 10. 디버그 패널 진입은 그대로 둔다

10-tap 제스처 + `VITE_DEBUG_CODE` 입력을 유지한다. 로컬이라고 자동 해제하지 않는다. fail-closed
게이트에 예외를 내는 건 이 트랙이 감당할 일이 아니다.

### 범위

**포함**

- `apps/mobile` — 딥링크 스킴 분기 2곳 · `injectionScripts.ts`의 stage 주입 · `.env.example`(로컬 템플릿으로)
- `apps/mobile/ios/Chatic.xcodeproj/project.pbxproj` — configuration별 `ENVFILE` build setting 신설
- `apps/mobile/ios/.../xcschemes/*.xcscheme` — `.env`를 덮어쓰던 build pre-action 삭제
- `libs/device-utils/src/stores/deviceInfoStore.ts` — `as Env` 캐스팅 → 어휘 매핑 테이블
- 루트 `package.json` — `mobile:ios:local` · `mobile:android:local`
- `network_security_config.xml` · `webview-debugging.md` — 개인 IP 정리
- `README.md` · `apps/mobile/docs/` — 로컬 실행 절차와 **`.env` 의미 변경 안내**

**제외**

- 실기기 지원 (결정 2)
- 런타임 웹 주소 스위처 (결정 1)
- 디버그 패널 진입 완화 (결정 10)
- customZip 경로 변경
- `apps/web`의 vite 설정 — 결정 3으로 건드릴 필요가 없어졌다
- **`apps/desktop` · `apps/desktop-web`** — 결정 9. 데스크톱의 stage는 푸시 브로커 어휘라 손대지 않는다
- `mobile:start`(Metro)의 이름 (결정 7)
- `android/app/build.gradle`의 `envConfigFiles` — 이미 맞다. 건드리지 않는다
- `VITE_WS_ENDPOINT` 죽은 항목 제거 — 별건이다(§다음 단계)

## 대안 (Alternatives)

**런타임 스위처 부활.** 앱 안에서 주소를 바꾸면 재빌드가 없어 가장 편하다. 버렸다 — ADR-0080 결정 13을
뒤집는 일이고, 그 결정은 "웹이 브릿지로 자기가 로드될 주소를 바꿀 수 있다"는 구체적 위협을 막고 있다.
dev 빌드 전용 게이트로 좁힐 수는 있지만, 얻는 건 재빌드 한 번을 아끼는 것뿐이라 값이 안 맞는다.

**customZip 확장.** 로컬 정적 서버 경로가 이미 있어서 새 표면이 안 는다. 버렸다 — zip은 스냅샷이라
HMR을 못 준다. 로컬 실행의 핵심이 그것이다.

**Android를 `10.0.2.2`로 고정.** 추가 명령이 없고 `network_security_config`에 이미 있다. 버렸다 —
`.env`가 플랫폼별로 갈라지고, 개인 IP를 지울 명분도 약해지고, 실기기로 넓힐 때 세 번째 주소
체계가 또 생긴다.

**앱은 `VITE_ENV=DEV`를 유지.** 딥링크 분기를 안 건드려도 된다. 버렸다 — 웹은 이미 로컬에서 `LOCAL`을
쓰고 `Stage`에도 세 값이 다 있다. 앱만 두 값으로 사는 건 어휘를 쪼개는 일이고, 디버그 패널의
`env.buildStage`가 로컬 빌드를 DEV라고 말하게 된다.

**로컬을 `.env.local`로 분리.** 기존 `.env`를 안 건드려서 iOS 개발자의 이사가 없다. 버렸다 —
web 계열에 없는 네 번째 파일이 생기고, `.env`가 "iOS의 dev용"이라는 mobile만의 예외가 그대로 남는다.
`.env.dev`에서 파생 생성하는 안도 같이 버렸다. web이 안 하는 일을 mobile만 하면 그게 다시 어긋남이고,
어차피 덮을 키가 둘뿐이라 파생의 값어치가 크지 않다.

**`mobile:start`를 로컬 실행으로 재정의.** web의 `start = 로컬` 관례를 문자 그대로 가져오는 안이다.
버렸다 — 그 이름은 Metro가 점유하고 있고, 바꾸면 기존 워크플로와 문서가 한꺼번에 깨진다. 이름보다
stage 어휘를 맞추는 쪽이 통일의 실질이다(결정 7).

**iOS도 스크립트에서 `ENVFILE`을 넘기기.** build setting을 안 건드려도 된다. 버렸다 — Xcode GUI에서
"Chatic Dev"를 직접 빌드하면 `ENVFILE`이 없어 `.env`(로컬)로 떨어진다. 결정 5가 `.env`의 의미를
바꾸는 순간 이건 실제 사고가 된다.

**stage 어휘를 양 플랫폼 다 고치기.** 처음 결정은 그것이었다. 리뷰에서 데스크톱의 주입값이 곧 SNS
플랫폼 앱 이름이고 서버에 `-stage`가 없다는 것이 확인되어(`docs/specs/cross-cloud-push.md:63`)
모바일만 남겼다. 데스크톱은 백엔드 선행 작업이 있어야 가능하다.

**stage 어휘를 아예 안 고치기.** 로컬 실행만 떼면 주입값을 건드릴 일이 없다. 버렸다 — `VITE_ENV`에
세 번째 값이 생기는 것이 이 트랙이고, 그 값이 주입되는 자리를 정리하지 않으면 어긋남만 하나 더 는다.

## 결과 (Consequences)

### 얻는 것

- 앱 로컬 실행이 한 명령이 된다. 웹·데스크톱과 형태가 같아진다.
- **env 파일 세 개의 의미가 리포 전체에서 하나가 된다.** `.env`는 어느 앱에서든 로컬이다.
- **같은 dev 빌드가 플랫폼마다 다른 파일을 읽던 것이 없어진다.**
- 개인 IP를 리포에 커밋하는 관행이 사라진다.
- 딥링크 스킴의 두 출처(빌드 설정 / 런타임)가 세 번째 stage 값에서도 일치한다.
- 셸 셋의 stage 어휘가 하나가 되고, 주입값이 실제로 먹기 시작한다.
- 새 스크립트가 `package.json` 항목 2개뿐이다. 생성기도 새 env 파일도 없다.

### 감수하는 트레이드오프

- **기존 iOS 개발자는 `.env`의 dev 설정을 `.env.dev`로 한 번 옮겨야 한다.** 자동 이사를 넣지 않기로
  했으므로 안내 문서가 이 이사의 유일한 수단이다. `README.md`와 `apps/mobile/docs/`에 적는다.
- **iOS `project.pbxproj`를 건드린다.** 머지 충돌이 잦은 파일이다. 다만 추가하는 건 configuration
  네 곳의 한 줄씩이고, `APP_URL_SCHEME` 바로 옆이다.
- **주소를 바꾸려면 재빌드한다.** 런타임 스위처를 포기한 대가다.
- **주입 어휘가 플랫폼마다 다른 채로 남는다.** 모바일은 `Env`, 데스크톱은 `'dev'`/`'prod'`다.
  통일을 포기한 게 아니라, 데스크톱 쪽 값이 서버가 소유한 SNS 앱 이름이라 클라가 혼자 못 바꾼다.
  읽는 쪽의 매핑 테이블이 그 차이를 흡수한다.
- **실기기는 여전히 수동이다.** 오늘과 같다. 나빠지지는 않는다.
- **`adb reverse`가 기기 재연결마다 날아간다.** 스크립트를 다시 돌려야 한다.

### 되돌리는 방법

결정 1~4와 7~8은 쉽다. 새 스크립트를 지우고 딥링크 극성을 되돌리면 된다.

**결정 5~6은 사람 손이 한 번 더 든다.** 되돌리려면 iOS의 `ENVFILE` build setting을 지우고,
`.env`를 다시 dev 설정으로 되돌려야 한다 — 개발자마다 로컬 파일이라 코드로 되돌릴 수 없다. 다만
잘못돼도 드러나는 방식이 조용하지 않다(빌드가 로컬 주소를 물고 뜬다). 발견은 빠르다.

**결정 9도 쉽다.** 데스크톱을 범위에서 뺀 덕에 푸시로 나가는 값이 하나도 바뀌지 않는다. 모바일의
주입값은 표시용 소비자 두 곳에만 닿고, 읽는 쪽 매핑 테이블이 구버전 주입값까지 받으므로 웹이 먼저
배포돼도 안전하다.

## 다음 단계

- **데스크톱 stage 어휘 통일** — 서버에 `chatic-desktop-stage` SNS 앱을 만들고 자격증명을 맞춘 뒤라야
  가능하다. 백엔드 선행 작업이라 이번 범위에서 뺐다.
- **`isCustomZipAllowed`의 fail-open** — `VITE_ENV`가 비면 `!== 'PROD'`가 참이라 허용으로 떨어진다.
  같은 상황에서 `toEnvStage`는 `'prod'`로 fail-closed 한다. 극성을 맞추는 게 맞다.
- `VITE_WS_ENDPOINT` 죽은 항목 제거 — `apps/mobile/.env.example` · `src/types/env.d.ts` ·
  `src/types/react-native-config.d.ts`. 이 트랙과 독립이다.
- iOS `webviewDebuggingEnabled` 미설정 — `webview-debugging.md`가 이미 지적해 둔 미결이다. 로컬 실행이
  흔해지면 더 자주 걸린다.
- 실기기 로컬 실행 — ATS 예외와 LAN IP 해석을 어떻게 다룰지 별도로 정한다.
- 구현과 아키텍처 문서는 [apps/mobile/docs/local-run.md](../../apps/mobile/docs/local-run.md)에 있다.
