# Cross-Cloud Push 알림 — Desktop 해결 내역 & Mobile 개발 필요사항

작성: 2026-06-15 · 브랜치 `feature/louis-update-electron`

## 1. Cross-Cloud Push란

한 사용자는 여러 **cloud(workspace)** 에 속한다. 라이브 WebSocket은 **현재 접속 중인 cloud 하나**만 커버하므로, 사용자가 보고 있지 않은 **다른 cloud**에 새 메시지가 오면 인앱으로는 알 수 없다. 이 공백을 메우는 것이 cross-cloud push:

> 백엔드 pushes-api가 사용자의 모든 cloud 메시지를 **하나의 FCM 토큰/엔드포인트**로 fan-out → 클라이언트가 받아 OS 알림 + rail 배지 + 인앱 토스트로 표시.

핵심 제약(아키텍처): 토큰은 **계정 단위 1개**(`users/0/reg-dev`), 백엔드는 모든 cloud를 **동일 SNS 엔드포인트**로 보낸다. push payload의 `cid`(cloud id)가 유일한 cloud 식별자지만 **배포 백엔드는 `cid=""`로 보냄** → 클라이언트가 캐시로 역추적해야 한다.

## 2. Desktop 아키텍처 (전체 경로)

```
[Firebase 프로젝트 (스테이지별)]
        │  FCM
        ▼
[backend pushes-api]  메시지 발생한 cloud → SNS Platform App(chatic-desktop-<stage>) → endpoint publish
        │
        ▼  FCM (mtalk.google.com:5228, MCS protocol)
[Electron main: fcm.ts]  push-receiver가 가짜 Android 기기로 등록 → 토큰 수신 + 푸시 수신
        │  IPC: OnReceiveNotification
        ▼
[desktop-web renderer]
   ├─ OS 알림 (main: showOsNotification)
   ├─ resolvePushCloudId  (cid="" → IndexedDB 캐시 역추적으로 cloud 귀속)
   ├─ useCrossCloudPushBadge  → useCloudPushBadgeStore.mark(cid)  → CloudRail 점
   └─ useCrossCloudPushToast  (포커스 시 인앱 토스트)
```

### 토큰 등록 흐름

1. `fcm.ts` → `AndroidFCM.register(senderId=...)` → FCM 토큰. 토큰은 **senderId가 가리키는 Firebase 프로젝트에 귀속**.
2. main이 `onToken` → renderer `FetchFcmToken` 응답.
3. `useDeviceTokenRegistration` → `POST users/0/reg-dev` → 백엔드가 SNS `CreatePlatformEndpoint`로 엔드포인트 생성 + DB 저장.
4. 백엔드 fan-out이 그 엔드포인트로 publish → FCM → push-receiver 수신.

### 관련 파일

| 영역                                         | 파일                                                       |
| -------------------------------------------- | ---------------------------------------------------------- |
| push-receiver, mtalk, 재연결 + 10분 watchdog | `apps/desktop/src/main/fcm.ts`                             |
| startFcm 배선, OS알림, deviceId              | `apps/desktop/src/main/index.ts`                           |
| 토큰 등록(reg-dev) + focus 재등록            | `apps/desktop-web/.../hooks/useDeviceTokenRegistration.ts` |
| reg-dev API (`force` 옵션)                   | `libs/users/src/apis/index.ts`, `hooks/index.ts`           |
| cid 역추적                                   | `apps/desktop-web/.../utils/resolvePushCloudId.ts`         |
| 비활성 cloud 배지 마크                       | `apps/desktop-web/.../hooks/useCrossCloudPushBadge.ts`     |
| 배지 스토어(persist)                         | `apps/desktop-web/.../stores/useCloudPushBadgeStore.ts`    |
| 인앱 토스트                                  | `apps/desktop-web/.../hooks/useCrossCloudPushToast.ts`     |
| 떠난 cloud 배지 유지                         | `apps/desktop-web/.../hooks/useRetainLeavingCloudBadge.ts` |
| rail 타일 배지 렌더                          | `apps/desktop-web/.../components/CloudRail.tsx`            |
| active-cloud unread 집계                     | `apps/desktop-web/.../hooks/usePlaceUnreadCounts.ts`       |
| 백엔드                                       | `chatic-pushes-api` (reg-dev → SNS, fan-out)               |

### Firebase 프로젝트 (스테이지별, 중요)

| 스테이지 | 프로젝트          | senderId     | package           | google-services                                         |
| -------- | ----------------- | ------------ | ----------------- | ------------------------------------------------------- |
| dev      | **lemondu-ecb38** | 429595905351 | io.chatic.dou.dev | `apps/mobile/android/app/src/dev/google-services.json`  |
| prod     | **chaticdou**     | 884488290426 | io.chatic.dou     | `apps/mobile/android/app/src/prod/google-services.json` |

SNS: account `085403634746`, region `ap-northeast-2`, platform apps `chatic-desktop-{dev,prod}`. **각 SNS 앱의 FCM 자격증명 = 해당 스테이지 Firebase 프로젝트.** 토큰 등록 프로젝트와 SNS 자격증명 프로젝트가 **일치해야** FCM이 전달한다.

## 3. Desktop에서 해결한 이슈

### (1) 전달 자체가 안 됨 — `SENDER_ID_MISMATCH` ★근본원인

- **증상**: dev 데스크탑에서 cross-cloud push 0개 수신. SNS endpoint가 publish 직후 `Disabled`로 전환.
- **진단**: 서비스계정으로 토큰에 직접 FCM v1 전송 → `403 SENDER_ID_MISMATCH`. 데스크탑 토큰은 `chaticdou`로 등록됐는데 dev 백엔드/SNS는 `lemondu-ecb38`로 전송 → FCM 거부 → SNS가 endpoint 자동 Disable.
- **원인**: dev 데스크탑 FCM 클라이언트 설정(`MAIN_VITE_FCM_*`)이 잘못된 프로젝트(chaticdou).
- **해결**: dev는 `lemondu-ecb38` 값 사용. 로컬은 `apps/desktop/.env.development.local`(gitignore), 빌드는 CI가 스테이지별 주입. → 토큰·SNS 프로젝트 일치 → 전달 확인.
- **교훈**: **데스크탑 FCM 키 = 그 스테이지 백엔드/SNS가 전송하는 Firebase 프로젝트와 반드시 일치.** 스테이지별 분리(dev/prod) 유지.

### (2) 간헐 누락 (전달되다 안 되다)

- **증상**: 잘 오다가 가끔 OS 배너조차 안 뜸. sleep/wake·네트워크 전환 후 빈번.
- **원인**: push-receiver의 mtalk 소켓이 **half-open**(close 이벤트 없이 죽음). heartbeat 비활성 + OS TCP keepalive 기본 ~2시간 → 그동안 푸시 유실. 또 라이브러리 자체 재연결과 기존 코드의 'disconnect' 재연결이 **이중**(좀비 소켓).
- **해결** (`fcm.ts`, commit `676ba2fa`): 단일 관리 재연결 + `powerMonitor` `resume`/`unlock-screen`에 강제 재연결. wifi 토글/sleep 후 큐된 푸시 재전송(persistentIds 중복제거) 확인.
- **잔여 보강** (`fcm.ts`, commit `abbeb6cf`): 위는 `close`/`resume` 이벤트가 **있을 때만** 복구된다. 앱이 깨어있는 채 네트워크만 조용히 끊기면(NAT rebind, wifi roam) 어떤 이벤트도 안 뜨고 OS TCP keepalive(~2h) 전까지 유실. → **10분 watchdog 강제 재연결** 추가(서버가 login 시 큐 재전송, persistentIds 중복제거).
- **장기 백그라운드 유실** (`fcm.ts`+`index.ts`, commit `fd729a92`): push-receiver는 OS 데몬이 아니라 **인프로세스 소켓**이라, 오래 백그라운드에 있으면 macOS **App Nap**이 앱(main 포함)을 suspend → 소켓도 watchdog 타이머도 정지 → 수신 멈춤. `backgroundThrottling:false`(렌더러)는 App Nap을 못 막음. → ① `index.ts`에서 `powerSaveBlocker('prevent-app-suspension')`로 suspend 차단(디스플레이 sleep은 허용), ② 앱 포그라운드 복귀는 `powerMonitor resume`가 아니므로 `app.on('browser-window-focus')`에 throttle(30s) 재연결 추가. 6시 넘긴 장기 백그라운드 수신 확인.

### (3) "reg-dev OK인데 SNS endpoint 없음" — stale 캐시

- **증상**: reg-dev가 성공+endpoint ARN 반환하는데 SNS 콘솔엔 endpoint 0개.
- **원인**: 백엔드 `registerDevice`(`chatic-pushes-api/.../proxy.ts:501`) 가드가 **1시간 타임아웃 내 + isEnabled면 STEP.4(createEndpoint) 통째 스킵**, deviceId로 캐시된(이미 삭제된) endpoint를 그대로 반환. 주석(`@250205`)은 "토큰 변경 시 재등록" 의도였으나 조건에 토큰 비교가 누락.
- **해결(FE, commit `676ba2fa`)**: `useDeviceTokenRegistration`을 토큰 dedup 제거 → **매 실행 재등록 + `force=true`**(reg-dev 쿼리파라미터) → 백엔드 STEP.4 강제 실행.
- **잔여 보강(FE, commit `abbeb6cf`)**: 위는 **launch 때 1회만** 재등록 → 실행 중 endpoint가 Disabled되면 재시작 전까지 복구 안 됨("재실행했더니 다시됨"의 원인). → **window focus 시 throttle(60s) `force` 재등록** 추가 → 앱 복귀만으로 Disabled endpoint 재활성.
- **권장(백엔드, 미적용)**: `proxy.ts:501` 가드에 `tokenChanged` 추가 + 기존 endpoint에 `SetEndpointAttributes(Enabled=true, Token)` 호출(SNS는 `CreatePlatformEndpoint`로 Disabled를 자동 복구하지 않음). ※FE 보강은 완화책 — 근본은 백엔드 reg-dev가 Disabled endpoint를 Enable해야 함.

### (4) 비활성 cloud rail 배지 유지 안 됨

- **증상**: cloud A에 안읽음 있을 때 rail 점 표시 → 다른 cloud로 전환하면 A의 점 사라짐(아직 안읽음인데).
- **원인**: `usePlaceUnreadCounts`는 **active cloud만** 집계(라이브 소켓이 그것만 커버) → cloud 전환 시 reset → 떠난 cloud unread 소실. 비활성 cloud는 `badgedClouds`(푸시 마크)에만 의존.
- **해결** (commit `ef9f3985`): `useRetainLeavingCloudBadge` — cloud 전환 시 떠나는 cloud에 안읽음이 남아있으면 `useCloudPushBadgeStore.mark()` → rail 점 유지. 재방문 시 active 집계가 이어받고 읽으면 사라짐.

### 잔여/운영 점검

- 운영 SNS `chatic-desktop-prod` 자격증명 = `chaticdou`인지 확인(과거 40개 수신으로 일치 추정).
- CI가 dev 빌드에 lemondu-ecb38, prod 빌드에 chaticdou 키 주입하는지 점검(`.env.{dev,production}`엔 키 없음 — CI 주입).
- 디버깅 중 쌓인 SNS Disabled 잔재 endpoint 정리.

## 4. Mobile (apps/web) — 개발 필요사항

### 현황

모바일은 **네이티브 FCM**을 쓰므로 토큰/전달 경로는 다르다(push-receiver 불필요). 보유:

- `useDeviceTokenRegistration` (네이티브 FCM 토큰 → reg-dev)
- `usePlaceUnreadCounts`, `useTotalUnreadCount` (active cloud unread)
- `useCloudSwitchFlow`, `useInviteClouds`

### 데스크탑 자가복구가 모바일에도 되나? (핵심)

**OS 알림 전달은 모바일이 이미 됨** — 네이티브 FCM(Android)/APNs(iOS)가 계정 토큰으로 모든 cloud 푸시를 OS 배너로 받는다. push-receiver 불필요.

데스크탑에서 추가한 두 자가복구의 모바일 적용성은 다르다:

| 데스크탑 fix                    | 대상 문제                          | 모바일                                                                                                         |
| ------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 10분 watchdog 재연결 (`fcm.ts`) | push-receiver mtalk 소켓 half-open | **불필요/불가** — 앱이 소켓을 들지 않음. OS push 데몬이 연결 관리(push-receiver보다 안정). 이슈(2) 자체가 없음 |
| powerSaveBlocker + focus 재연결 | App Nap이 인프로세스 소켓 suspend  | **불필요** — OS 네이티브 푸시는 앱 suspend와 무관하게 전달. App Nap 문제 없음                                  |
| focus throttle force 재등록     | SNS endpoint mid-session Disabled  | **적용 가능·유효** — 같은 SNS endpoint Disable 위험 존재. 포그라운드 복귀 시 `force` 재등록 동일 포팅          |

즉 **모바일은 "전달"은 이미 되고(OS 데몬이 background·App Nap 무관하게 처리), 데스크탑식 소켓 watchdog/App Nap 대응은 전부 해당 없음**. 모바일에 실제로 빌드할 것은 (a) endpoint 자가복구(focus 재등록 포팅) — 선택, (b) **인앱 cross-cloud 표시 레이어** — 아래가 본체.

### 미구현 — 코드 탐색 결과(현재 상태)

| 기능                              | Desktop                                      | Mobile 현재 상태                                                                                         |
| --------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 푸시 이벤트 수신                  | `webClient.onEvent('OnReceiveNotification')` | ⚠️ **API는 동일** — `useOnReceiveNotification`(libs/app-messages) **정의돼 있으나 아무 데도 연결 안 됨** |
| 비활성 cloud 배지 스토어(persist) | `useCloudPushBadgeStore`                     | ❌ 없음                                                                                                  |
| 푸시 수신 시 cloud 마크           | `useCrossCloudPushBadge`                     | ❌ 없음                                                                                                  |
| cid 없는 푸시 cloud 귀속          | `resolvePushCloudId`                         | ❌ 없음 (캐시 구조 다름 — 아래)                                                                          |
| 인앱 토스트(포커스 시)            | `useCrossCloudPushToast`                     | ❌ 없음 (단, `useToast`/Sonner primitive는 **있음**)                                                     |
| 떠난 cloud 배지 유지              | `useRetainLeavingCloudBadge`                 | ❌ 없음 (모바일 `usePlaceUnreadCounts`도 **active-cloud-only** → 동일 이슈)                              |
| cloud 전환 UI + 배지 렌더         | `CloudRail`(항상 노출)                       | ⚠️ `CloudSessionSheet`(숨은 bottom sheet) + `PlaceList`(active만) — **배지 미표시**                      |

**핵심 차이 2가지** (탐색 확정):

1. **이벤트 수신은 같은 브릿지** — 데스크탑은 Electron main이, 모바일은 RN 쉘이 `OnReceiveNotification`을 `@chatic/bridges` `webClient`로 보낸다. 모바일은 훅(`useOnReceiveNotification`)이 이미 있고 **마운트만 안 됨** → 수신 배선은 거의 공짜.
2. **cid 역추적 캐시가 다름** — 데스크탑은 `ChaticWebCacheDB` IndexedDB를 스캔(channel record에 `cid` 보유). 모바일 캐시(`ChatDB`, key `userId@channelId`)는 channel에 **`sid`만 있고 `cid` 없음**; `cid`는 **place(MySiteView)** 에 있다. → 모바일은 `push.sid → 메모리 place 목록에서 place.cid` 조인이 더 단순(IndexedDB 스캔 불필요).

### 개발 항목 (파일 단위, 순서대로)

1. **인캄잉 푸시 배선** — `apps/web/.../hooks/useCrossCloudPush.ts` 신설: `webClient.onEvent('OnReceiveNotification')` 구독(또는 기존 `useOnReceiveNotification` 활용), app/HomePage에 마운트. 페이로드 `{title, body, data{cid, channelId, sid, channelName, ownerId}}`, `cid=""` 가정.
2. **cid 귀속(모바일판)** — `apps/web/.../utils/resolvePushCloudId.ts`: `push.data.sid → place.cid`(메모리 place 목록). fallback: `sid` 비면 `channelId → channel.sid → place.cid`. 유니크 매치만 채택(없으면 무배지).
3. **배지 스토어 + 마크 훅** — `useCloudPushBadgeStore`(Zustand persist, key 충돌 없음) + `useCrossCloudPushBadge`(active cloud면 skip, 아니면 `mark(cid)`) 포팅. cloud id 키 = 소켓 `cloudId`와 일치 확인.
4. **떠난 cloud 유지** — `useRetainLeavingCloudBadge` 포팅(cloud 전환 시 안읽음 남으면 마크). 모바일 `usePlaceUnreadCounts`도 active-only라 동일하게 필요.
5. **표시 UI (phone-shaped, ★디자인 결정)** — rail 없음 → **2면 권장**:
    - (a) **헤더 인디케이터**: `HomePage` cloud 스위처 버튼(ArrowLeftRight)에 점/카운트 — sheet가 숨어있어 **발견성** 위해 필수.
    - (b) **`CloudSessionSheet` 항목별 배지**: `CloudItem`에 cloud별 안읽음 점/카운트(`badgedClouds[cloud.id]` + active cloud unread) — **상세**.
    - = 데스크탑 rail의 phone 등가물(발견 + 상세 분리).
6. **인앱 토스트** — `useCrossCloudPushToast` 포팅(필터: 내 메시지 아님 + active 채널 아님 + title/body 있음). primitive=`useToast`/Sonner 재사용. 탭 → `useCloudSwitchFlow`로 해당 cloud 전환 + 채널 열기.
7. **(선택) endpoint 자가복구 패리티** — 모바일 `useDeviceTokenRegistration`은 아직 localStorage 토큰 dedup(구버전). 포그라운드 복귀 시 throttle `force` 재등록(desktop `abbeb6cf`) 포팅 — 우선순위 낮음(모바일 OS 푸시가 더 안정).
8. **토큰/프로젝트 일치 검증** — 모바일 네이티브는 빌드 flavor google-services(dev=lemondu-ecb38/prod=chaticdou) 사용 → 보통 일치하나, reg-dev 등록 후 SNS 전달까지 한 번 검증(SENDER_ID_MISMATCH 점검).

**순서/사이즈**: 1→2→3 = 코어(푸시→cid→배지) **M**, 검증=다른 cloud 메시지 시 콘솔/헤더에 cid 마크. 4 작음. 5 = UI(디자인 결정 선행). 6 = **S**. 7·8 선택.

### 공유화 제안 (port-first, 추출은 나중)

**먼저 `apps/web`로 포팅(복붙) → 안정화 후 `libs/` 추출** 권장. 이유:

- `resolvePushCloudId`는 플랫폼별 캐시(IndexedDB scan vs place.cid 조인)로 **실제 구현이 다름** → 공통화 이득 작음.
- `useCloudPushBadgeStore`·`useRetainLeavingCloudBadge`·토스트 필터 로직은 작고 계약 동일 → 안정 후 `libs/`(app-runtime 또는 신규 push lib)로 추출해 공유.
- 표시 UI(CloudRail vs phone 헤더/sheet)는 플랫폼별 분리 유지(프로젝트 원칙: 엔진 공유, presentation 재구축).
- 조기 lib 추출은 아직 움직이는 두 구현을 결합만 시킴.

> 상세 구현 플랜: `.claude/20260615/PLAN-17-12-42.md`

## 5. 참고 커밋

- `676ba2fa` fix(desktop): FCM 재연결 + 매실행 재등록(force)
- `ef9f3985` fix(desktop-web): 떠난 cloud rail 점 유지
- `abbeb6cf` fix(desktop): 재시작 없이 자가복구 — 10분 watchdog 재연결 + focus throttle 재등록
- `fd729a92` fix(desktop): 장기 백그라운드 푸시 유지 — App Nap 차단(powerSaveBlocker) + focus 재연결
- (기존) `24604c60` cross-cloud push via FCM, `eaa549b0` push rail badge, `2fb4ba45` cid 역추적, `9f89e8d4` 인앱 토스트
