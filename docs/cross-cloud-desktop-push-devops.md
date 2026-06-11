# 데스크탑 크로스-클라우드 푸시 — devops / 백엔드 요청

> 목적: DoU **데스크탑(Electron)** 앱이 다른 클라우드(다른 배포)의 메시지 알림을
> 받게 하기 위해, 백엔드/devops 측에서 필요한 **콘솔 작업 2건 + 확인 3건**.
> 클라이언트(데스크탑) 코드는 별도 PR로 진행한다.

## 배경

- 데스크탑은 현재 **선택된 클라우드의 라이브 WebSocket**으로만 알림을 만든다.
  다른 클라우드 메시지는 연결 자체가 없어 알림이 안 온다 (FCM 미사용).
- **모바일은 이미 크로스-클라우드 알림이 정상 동작** → 백엔드가 디바이스 토큰 1개로
  모든 클라우드 메시지를 FCM/SNS로 **fan-out** 하는 게 실증됨.
- 따라서 데스크탑은 **모바일과 동일한 백엔드 경로**(중앙 `chatic-pushes-api`)를 타면 된다.
  단, 데스크탑엔 네이티브 firebase가 없어 **Node FCM 수신기(`@liamcottle/push-receiver`)**
  로 FCM 토큰을 발급/수신한다. 발급한 토큰은 기존 `reg-dev` 로 등록한다.

## 확인된 사실 (코드 근거)

- 디바이스 등록은 **홈 브로커에 1회**: `POST ${DOU_ENDPOINT}/users/0/reg-dev`,
  body에 cloudId 없음 (`libs/users/src/apis/index.ts:69`, `RegisterDeviceTokenBody`).
  → 클라우드별 등록이 아니라 **단일 토큰 + 백엔드 fan-out**.
- 등록 시 SNS PlatformApplication을 **이름 정확 매칭**으로 찾는다:
  `application.findByName(<application>-<platform>-<stage>)`
  (`chatic-pushes-api/src/modules/pushes/proxy.ts:276-288`).
  없으면 **throw**: `"@name[...] is invalid (no application, run /applications/sync-list)"`.
  → `platform='desktop'`으로 등록하면 **`chatic-desktop-<stage>` SNS 앱이
  반드시 존재해야** 한다. 기존 `chatic-android`(FCM)로 **자동 폴백 안 됨**.
- **platform 문자열은 enum 검증 안 함** — 비어있지만 않으면 통과(transformer:524),
  소문자화 후 그대로 앱 이름에 쓰임(`asDeviceModel`, proxy.ts:379). 그래서 `'desktop'`
  그대로 OK (`'web'` 강제 아님). `isWEB=startsWith('web')`라 'desktop'은 ios/android/web
  플래그가 0이지만 **그 플래그는 메타데이터일 뿐 배달/페이로드 분기에 안 쓰임**(무해).
- **provider(FCM/APNS)는 platform이 아니라 SNS 앱의 실제 타입에서 옴**:
  `service: $app.type`(proxy.ts:258). sandbox도 endpoint/stage 기준(proxy.ts:657).
  → `chatic-desktop-*`를 **FCM(GCM)으로 생성**하면 FCM 배달. android와 동일 FCM 자격증명.
- 기존 명명 = `chatic-<platform>-<stage>` (`chatic-android-dev/prod`, `chatic-ios-dev/prod`,
  모두 SNS 콘솔에서 확인됨) → 데스크탑은 **`chatic-desktop-dev` / `chatic-desktop-prod`**.

---

## ✅ 요청 1 — SNS GCM PlatformApplication 신규 생성

데스크탑 FCM 토큰을 받을 SNS 플랫폼 앱을 추가한다. **기존 Android FCM 자격증명을 그대로
재사용**하므로 새 Firebase 프로젝트/서버키는 필요 없다.

1. AWS SNS 콘솔(리전 `ap-northeast-2`) → **Create platform application**
    - 이름: **`chatic-desktop-dev`**, **`chatic-desktop-prod`** (각 스테이지 1개씩)
      — 기존 `chatic-android-dev/prod` 패턴과 동일 (`chatic-<platform>-<stage>`, SNS 콘솔 확인됨).
    - Push notification platform: **Firebase Cloud Messaging (FCM)** (chatic-android과 동일)
    - Authentication method: **Token** (서비스계정 JSON; 레거시 서버키는 폐기/비활성)
        - **dev/prod는 별도 Firebase 프로젝트** (`ChaticDoU-Dev` / `ChaticDoU-Prod`,
          sender도 다름 — dev=`429595905351`). chatic-android과 **동일 프로젝트** 사용.
        - 각 프로젝트: Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성 → JSON.
          `chatic-desktop-dev` ← Dev 프로젝트 JSON, `chatic-desktop-prod` ← Prod 프로젝트 JSON.
2. ✅ **완료** — `chatic-pushes-api` **`GET /applications/sync-list`** (aws4, `--profile lemon`)
   를 dev/prod 각 게이트웨이에 호출 → SNS→DB sync 됨. 실제 게이트웨이(acct 085403634746):
    - dev: `https://nv9i08zwd6.execute-api.ap-northeast-2.amazonaws.com/dev/applications/sync-list`
    - prod: `https://0z2nshq7r0.execute-api.ap-northeast-2.amazonaws.com/prod/applications/sync-list`
    - (코드 주석의 `z2515o8a8b` URL은 stale.) DB에 `chatic-desktop-dev`(id 1000012) +
      `chatic-desktop`(id 1000013, prod, GCM) 등록 확인됨.
3. 데스크탑 등록 시 전송값: `application:'chatic'`, `platform:'desktop'`, `stage:'dev'|'prod'`.

## ✅ 요청 2 — Firebase **Web 앱** config 제공

데스크탑의 Node 수신기(`push-receiver`)가 FCM 토큰을 발급하려면 **Web 앱** 자격 + VAPID가
필요하다. **dev/prod 별도 프로젝트**(`ChaticDoU-Dev` / `ChaticDoU-Prod`)라 **각각** 수집한다.

각 프로젝트(Dev, Prod)에서:

1. **Web 앱 추가**: 프로젝트 설정 → **일반** 탭 → 내 앱 → **앱 추가 → 웹(`</>`)** (없으면 1개).
   → `apiKey`, `appId`, `projectId`, `messagingSenderId` 표시됨.
2. **VAPID**: 프로젝트 설정 → **클라우드 메시징** 탭 → (Web 앱 추가 후 생기는) **웹 푸시 인증서**
   → **키 쌍 생성** → public key.

전달 값 (Dev/Prod 각각): `projectId`, `apiKey`, `appId`, `messagingSenderId`, `VAPID public key`.

## ❓ 확인 요청 (작음)

> ~~SNS 명명 규칙 / platform 값~~ → **해결됨.** SNS 콘솔에서 기존 명명
> `chatic-<platform>-<stage>` 확인(`chatic-android-prod` 등), 서버 코드상 platform 문자열은
> enum 검증 없이 그대로 앱 이름에 쓰임(proxy.ts:379) → **`chatic-desktop-*` + `platform:'desktop'`**
> 확정. provider는 SNS 앱 타입(FCM)에서 옴(proxy.ts:258).
> **남은 확인 1개 — FCM data payload 모양**: 클라우드 메시지 푸시의 `data`에 어떤 키로
> 딥링크/대상-클라우드 endpoint(`_backend`/`api`/`stage`)·`badge`·`title`/`body`가
> 실리는지? (데스크탑이 탭→클라우드 전환 라우팅을 모바일과 동일하게 재사용하려면 필요.)

---

## 데스크탑(클라이언트) 측 진행 (참고)

devops 2건과 무관하게 병렬로:

- **Phase S**: 데스크탑 토큰 등록 배선 (`reg-dev` round-trip; stub 토큰).
  → 백엔드가 데스크탑 등록 시도를 관측 가능 + SNS 앱 이름 확정에 도움.
- **Phase M**: `@liamcottle/push-receiver`(main 프로세스)로 실제 FCM 토큰 발급 + 백그라운드
  수신 → 기존 `ShowNotification`/`chatic-open` 딥링크 재사용.

요청 1·2가 끝나면 Phase M 이 end-to-end로 동작 가능.

## 참고 (코드 위치)

| 항목                                                 | 위치                                                                  |
| ---------------------------------------------------- | --------------------------------------------------------------------- |
| 디바이스 등록 API (단일 토큰, cloudId 없음)          | `dou-app/libs/users/src/apis/index.ts:69`                             |
| 등록 호출(웹, RN 셸 한정)                            | `dou-app/apps/web/src/app/shared/hooks/useDeviceTokenRegistration.ts` |
| SNS 이름 매칭 + 없으면 throw                         | `chatic-pushes-api/src/modules/pushes/proxy.ts:276-288`               |
| SNS 타입/ARN 형식 (`GCM`/`<App>-<Platform>-<stage>`) | `chatic-pushes-api/src/modules/pushes/lib/device-support.ts`          |
| 'web' 플랫폼 인식 (model flags)                      | `chatic-pushes-api/src/modules/pushes/model.ts:175`, `transformer`    |
| 데스크탑 OS 알림 표시 핸들러 (재사용)                | `dou-app/apps/desktop/src/main/index.ts` (`ShowNotification`)         |
