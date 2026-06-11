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
  → `platform='desktop'`(또는 `web`)으로 등록하면 **`chatic-desktop-<stage>` SNS 앱이
  반드시 존재해야** 한다. 기존 `chatic-Android`(GCM)로 **자동 폴백 안 됨**.
- SNS 타입은 `APNS | APNS_SANDBOX | GCM`. **GCM = FCM**. ARN 예시:
  `app/APNS_SANDBOX/Eureka-iOS-dev` → 이름 형식 `<App>-<Platform>-<stage>`.
  → 데스크탑/web FCM 토큰은 **GCM 플랫폼**(android와 동일 FCM 자격증명)으로 처리 가능.

---

## ✅ 요청 1 — SNS GCM PlatformApplication 신규 생성

데스크탑 FCM 토큰을 받을 SNS 플랫폼 앱을 추가한다. **기존 Android FCM 자격증명을 그대로
재사용**하므로 새 Firebase 프로젝트/서버키는 필요 없다.

1. AWS SNS 콘솔(리전 `ap-northeast-2`) → **Create platform application**
    - Push notification platform: **Firebase Cloud Messaging (GCM)**
    - 이름: **`chatic-desktop-dev`**, **`chatic-desktop-prod`** (각 스테이지)
        - ⚠️ 기존 모바일 앱의 **실제 명명 규칙에 맞춰** 주세요. 예: 현재가
          `chatic-Android-prod`면 `chatic-desktop-prod`, `android-chatic-prod`면
          `desktop-chatic-prod`. (아래 "확인 1" 참고)
    - Credential: **기존 `chatic-Android-*`와 동일한 FCM 서버키 / 서비스계정**
      (동일 Firebase 프로젝트, sender id `429595905351`).
2. `chatic-pushes-api` 의 **`POST /applications/0/sync-list`** 호출 → DB에 sync.
3. 확인: `GET /applications/0` 목록에 `chatic-desktop-*`(type=GCM)이 보이면 완료.

## ✅ 요청 2 — Firebase **Web 앱** config 제공

데스크탑의 Node 수신기(`push-receiver`)가 FCM 토큰을 발급하려면 동일 Firebase
프로젝트의 **Web 앱** 자격이 필요하다. (모바일은 google-services.json / plist를 쓰지만
Node 수신기는 Web 앱 config + VAPID 를 쓴다.)

- Firebase 콘솔 → 프로젝트 설정 → **앱 추가 → Web** (아직 없으면 1개 추가; 무료)
- 아래 값을 전달:
    - `projectId`
    - `apiKey` (web)
    - `appId` (web)
    - `messagingSenderId` (= **429595905351** 확인)
    - **VAPID public key** (클라우드 메시징 → 웹 푸시 인증서)

## ❓ 확인 요청 (작음)

1. **SNS 명명 규칙**: 현재 운영 SNS PlatformApplication 정확한 이름?
   (`chatic-Android-prod` vs `android-chatic-prod` vs `chatic-prod-Android` …)
   → 데스크탑 앱 이름을 여기에 맞춰 만든다.
2. **데스크탑이 `reg-dev`로 보낼 값** 확정 — 제안: `application:'chatic'`,
   `platform:'desktop'`(또는 `'web'`), `stage:'dev'|'prod'`.
   `application`을 `'chatic'`로 통일할지 `'chatic-desktop'`로 분리할지 결정 필요
   (SNS 앱 이름이 여기서 파생됨).
3. **FCM data payload 모양**: 클라우드 메시지 푸시의 `data`에 어떤 키로
   딥링크/대상-클라우드 endpoint(`_backend`/`api`/`stage`)·`badge`·`title`/`body`가
   실리는지? (데스크탑이 탭→클라우드 전환 라우팅을 모바일과 동일하게 재사용하려면 필요.)

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
