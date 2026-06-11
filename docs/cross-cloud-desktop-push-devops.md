# 데스크탑 크로스-클라우드 푸시 (FCM) — 구현 + devops 기록

> 상태: **클라이언트 구현 완료 + 경로 라이브 검증됨** (commit `feat(desktop):
> cross-cloud push notifications via FCM`). 남은 건 빌드/배포 + 백엔드 payload 확인 1개.

## 목적

데스크탑(Electron)이 **다른 클라우드(다른 배포)의 메시지 알림**을 받게 한다. 기존엔
현재 선택된 클라우드의 라이브 WebSocket만 봐서 다른 클라우드 메시지는 안 왔다 (FCM 미사용).
모바일은 이미 FCM 서버 푸시로 크로스-클라우드 알림이 되므로, 데스크탑도 **같은 백엔드 경로**
(중앙 `chatic-pushes-api` fan-out)를 타게 했다.

## 동작 방식

1. **수신부 (Electron main)**: `@liamcottle/push-receiver`로 **Android 디바이스로 등록**
   (`AndroidFCM.register`) → FCM 토큰 발급 + `mtalk.google.com:5228` MTLS 상시 연결로 푸시 수신.
   - ⚠️ **VAPID/웹푸시 아님.** working path는 android 등록이라 `androidPackageName` + `appId`만
     필요(빈 cert로 동작 — apiKey가 cert-restricted 아님). 처음 모았던 Web config/VAPID는 **불필요**.
   - 토큰 발급 + 실제 SNS publish→수신까지 **라이브 검증됨**(아래 "검증").
2. **등록 (desktop-web)**: `useDeviceTokenRegistration`이 `FetchFcmToken` 브리지로 토큰을 받아
   홈 브로커에 `reg-dev`(`application:'chatic'`, `platform:'desktop'`)로 등록.
3. **fan-out (백엔드, 기존)**: 중앙 `chatic-pushes-api`가 identity 기준으로 모든 클라우드 메시지를
   이 디바이스에 FCM 푸시 (mobile과 동일, cloudId 무관 — `cid`는 출처 태그일 뿐).
4. **표시**: 수신한 푸시 → 기존 `ShowNotification` 토스트 + `chatic-open` 딥링크 라우팅 재사용.

## ✅ devops — 완료됨

### SNS PlatformApplication (생성 + sync)

- AWS SNS(`ap-northeast-2`, acct `085403634746`)에 **`chatic-desktop-dev`**, **`chatic-desktop-prod`**
  생성 (FCM, Token=서비스계정 JSON, 각 스테이지 Firebase 프로젝트). 명명 = `chatic-<platform>-<stage>`.
- `chatic-pushes-api` **`GET /applications/sync-list`** (aws4, `--profile lemon`)을 dev/prod 각
  게이트웨이에 호출 → DB sync 완료. 게이트웨이:
  - dev: `https://nv9i08zwd6.execute-api.ap-northeast-2.amazonaws.com/dev/applications/sync-list`
  - prod: `https://0z2nshq7r0.execute-api.ap-northeast-2.amazonaws.com/prod/applications/sync-list`
  - DB 확인: `chatic-desktop-dev`(id 1000012) + `chatic-desktop`(id 1000013, prod, GCM, enabled).

### 등록 코드값 / Firebase creds

- 서버는 platform 문자열을 enum 검증 안 함 → `platform:'desktop'` 그대로 SNS 이름 매칭
  (`proxy.ts:379`). provider(FCM)는 SNS 앱 타입에서 옴(`proxy.ts:258`).
- 수신부가 쓰는 FCM creds는 **`apps/mobile/.../google-services.json`** 의 android 값 (committed):
  - dev(`lemondu-ecb38`/`429595905351`): apiKey `AIzaSyDlGgm…`, appId `1:429595905351:android:47907a6bcf…`, pkg `io.chatic.dou.dev`
  - prod(`chaticdou`/`884488290426`): apiKey `AIzaSyC-06p4…`, appId `1:884488290426:android:bada1aabec…`, pkg `io.chatic.dou`
  - → `apps/desktop/.env.dev` / `.env.production` 의 `MAIN_VITE_FCM_*` 에 baked.

> ~~요청 2 (Firebase Web 앱 config + VAPID)~~ → **불필요했음** (working path가 android 등록이라
> web push/VAPID 안 씀). 수집했던 Web config/VAPID는 사용 안 함.

## ❓ 남은 백엔드 확인 (1개, 선택)

- **FCM data payload 모양**: 클라우드 메시지 푸시의 `data`에 딥링크/대상-클라우드
  endpoint(`_backend`/`api`/`stage`)·`title`/`body`가 어떤 키로 실리는지. 기본 배달은 되지만,
  탭→정확한 클라우드 전환 라우팅을 다듬으려면 필요. (수신부는 appData를 generic 파싱하고
  `data.deeplink|url|link`를 딥링크로 씀.)

## 검증 (라이브, 앱 빌드 전)

dev 프로젝트로 실제 인프라 사용:
1. `AndroidFCM.register(apiKey, projectId, senderId, androidAppId, 'io.chatic.dou.dev', '')` → FCM 토큰 발급 ✓
2. `aws sns create-platform-endpoint`(chatic-desktop-dev) + `publish`(GCM data) ✓
3. `push-receiver` `ON_DATA_RECEIVED` 로 title/body/deeplink/cid 수신 ✓

## 남은 작업 (클라이언트)

1. **desktop-web 배포** (등록 훅 포함): `desktop-web:deploy:prod`.
2. **Electron 서명 빌드 + 설치**: `desktop:package:mac:prod:signed` — 수신부는 바이너리 안에 있어
   새 릴리즈 필요. auto-update(electron-updater)로 배포 가능.
3. 테스트: 설치+로그인 → reg-dev로 endpoint 생성 → **다른 클라우드**에 메시지 → desktop 알림.

## 코드 위치

| 항목 | 위치 |
|---|---|
| FCM 수신부 (register + listen) | `apps/desktop/src/main/fcm.ts` |
| FetchFcmToken 핸들러 + startFcm + 공유 showOsNotification | `apps/desktop/src/main/index.ts` |
| 토큰 등록 훅 (reg-dev, platform desktop) | `apps/desktop-web/.../hooks/useDeviceTokenRegistration.ts` |
| FCM creds (per-stage) | `apps/desktop/.env.dev`, `.env.production` |
| 디바이스 등록 API (단일 토큰, cloudId 없음) | `libs/users/src/apis/index.ts:69` |
| SNS 이름 매칭 / provider 결정 | `chatic-pushes-api/src/modules/pushes/proxy.ts:258,276-379` |
