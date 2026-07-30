# 신규 딥링크 연동 가이드 (V2 - Firestore 비사용 방식)

이 문서는 Firestore 데이터베이스를 거치지 않고 파라미터를 실시간 동기 파싱하여 웹뷰 및 브라우저 로그인 화면으로 즉시 연결해 주는 **신규 딥링크 사양(V2)**에 대한 프론트엔드 및 모바일 개발자용 연동/테스트 가이드입니다.

---

## 1. 개요 및 흐름도

신규 딥링크는 URL 쿼리 파라미터에서 직접 필요한 연결 정보를 획득하는 **동기식 파싱 방식**을 채택했습니다.

```
[초대 발송 서버] ──> SMS/인앱 공유용 신규 딥링크 생성
                                │
                                ▼
        ┌──────────────────────┴──────────────────────┐
        │                                             │
        ▼ (브라우저 진입)                             ▼ (모바일 앱 진입)
   [랜딩 페이지]                                 [모바일 앱 네이티브]
   - URL 동기 파싱                               - 라이브러리로 URL 파싱
   - backend 주소 조립                           - backend 주소 조립
   - provider, version 파라미터 결합            - provider, version 결합
        │                                             │
        ▼ (리다이렉트)                                ▼ (웹뷰 소스 로드)
  ─────────────────────────── [ 메인 웹앱 ] ───────────────────────────
   - URL 파라미터에서 code, provider, version, _backend 값 추출 및 검증
   - 추출한 정보를 기반으로 초대 수락 화면 및 가입 절차 진행
```

---

## 2. 딥링크 규격 및 파라미터 정보

### 딥링크 기본 포맷 (서버 생성 규격)

초대 링크는 두 가지 폼이 있고, **`relay` 플래그의 존재 여부가 판별자**다.

**① 클라우드 폼** — 백엔드 주소를 링크가 실어 나른다.

```
https://app.chatic.io/s?code=<inviteCode>&api=<apiId>&stage=<stage>
```

- `code` : URL 인코딩된 초대 코드 (포맷: `invt:<id>:<code>`)
- `api` : AWS API Gateway ID (예: `vjgudphpo4`)
- `stage` : 배포 스테이지 (예: `dev`, `prod` 등)

**② 릴레이 폼** — 릴레이 서버는 백엔드 주소가 필요 없으므로 `api`/`stage`가 없다.

```
https://app.chatic.io/s?code=<inviteCode>&relay
```

- `code` : 클라우드 폼과 동일
- `relay` : 값 없는 플래그. 릴레이 서버 초대임을 표시한다.

> [!IMPORTANT]
> `relay`는 **값이 아니라 존재 여부로** 판별한다. 값 없는 `&relay`는 `searchParams.get('relay') === ''`(빈 문자열)이므로 `get()`의 진위값으로 검사하면 정상 링크를 놓친다. 반드시 `searchParams.has('relay')`를 쓴다.

> [!TIP]
> **하위 호환성**: 기존에 생성된 구형 단축 링크 패턴(`https://app.chatic.io/s/{shortCode}`)도 자동으로 감지되며, 기존과 동일하게 Firestore 조회 Fallback 경로를 통해 안전하게 우회 작동합니다.

---

## 3. 웹뷰 및 랜딩페이지 연동 파라미터 매핑

웹앱(`apps/web`) 진입 시, 최종적으로 도달하는 주소 스키마는 다음과 같습니다.
랜딩 페이지와 모바일 네이티브 레이어가 아래의 규격을 맞춰 프론트엔드 URL을 동적으로 빌드해 줍니다.

**① 클라우드 폼 → `_backend`**

```
https://dou.chatic.io/auth/login?code=<inviteCode>&provider=invite&version=2&_backend=<backendUrl>
```

**② 릴레이 폼 → `relay=1`**

```
https://dou.chatic.io/auth/login?code=<inviteCode>&provider=invite&version=2&relay=1
```

릴레이 폼은 `_backend`를 **생략하는 대신 `relay=1`을 명시**한다. 웹이 "`_backend`가 없으니 릴레이겠지"라고 추론하지 않고 마커로 판정하도록 하기 위한 의도적 규격이다. 백엔드 주소는 `getDynamicRelayBackend()`(env 릴레이 엔드포인트)가 채운다.

### 웹앱에서 추출하여 사용하는 최종 파라미터 매핑표

| 추출할 파라미터 키 | 변수 역할          | 값 추출 예시                | 설명                                                                                                     |
| :----------------- | :----------------- | :-------------------------- | :------------------------------------------------------------------------------------------------------- |
| `code`             | 초대 코드          | `urlParams.get('code')`     | 디코딩된 초대 코드 (`invt:<id>:<code>`)                                                                  |
| `provider`         | 가입 제공자        | `urlParams.get('provider')` | 항상 고정값인 `"invite"`가 주입됩니다.                                                                   |
| `version`          | 딥링크 규격 버전   | `urlParams.get('version')`  | 항상 고정값인 `"2"`가 주입됩니다.                                                                        |
| `_backend`         | REST API 서버 주소 | `urlParams.get('_backend')` | 조립 완료된 REST 백엔드 URL 주소 <br> `https://<apiId>.execute-api.ap-northeast-2.amazonaws.com/<stage>` <br> **클라우드 폼에만 존재.** |
| `relay`            | 릴레이 초대 마커   | `urlParams.has('relay')`    | **릴레이 폼에만 존재**하며 항상 `"1"`로 정규화됩니다. `_backend`와 상호배타적이며, 둘 중 하나는 반드시 있어야 초대 진입으로 인정됩니다(`isInviteEntry`). |

> [!NOTE]
> 진입 판정은 `provider === 'invite' && code && (_backend || relay)`다 (`apps/web/.../home/types/invite.ts`). 초대 정보 조회(`useInviteInfo`)와 수락(`registerUserWithInviteCode`)은 `backend`가 없으면 `getDynamicRelayBackend()`로 폴백한다.

---

## 4. 프론트엔드 웹앱 파라미터 확인 가이드

웹앱의 로그인/초대장 화면(`LoginPage.tsx` 등)이 마운트될 때 기존 파라미터 추출부에서 다음과 같이 4가지 파라미터를 온전히 수신하여 사용할 수 있습니다.

### ① URL 파라미터 추출 코드 예시

```typescript
const urlParams = new URLSearchParams(window.location.search);

const code = urlParams.get('code'); // 예: "invt:910001:3f9a8b"
const provider = urlParams.get('provider'); // 항상 "invite"
const version = urlParams.get('version'); // 항상 "2"
const backend = urlParams.get('_backend') ?? undefined; // 예: "https://vjgudphpo4.execute-api.ap-northeast-2.amazonaws.com/dev"

// 추출한 파라미터 검증 예시
if (provider === 'invite' && version === '2') {
    console.log('[DeepLink V2] 신규 딥링크 파라미터 파싱 확인:', { code, backend });
    // 이후 비즈니스 로직(초대 정보 조회 및 가입 API 호출 등)에 backend 주소 및 code 적용
}
```

### ② 디버깅 시 파라미터 정상 수신 여부 확인법

- **브라우저 콘솔**: 크롬 개발자 도구(F12)의 Console 탭에서 `window.location.search`를 입력해 주소창 파라미터가 누락 없이 넘어왔는지 수동 점검합니다.
- **네트워크 탭**: 초대 수락 혹은 로그인 API를 호출할 때, `_backend` 주소로 지정한 도메인 주소로 API 요청이 전송되는지 확인합니다.

---

## 5. FAQ

**Q. 기존에 Firestore에 등록되어 돌고 있는 옛날 딥링크 주소도 잘 열리나요?**  
A. **네, 완벽하게 열립니다.** 시스템 내부에서 신규 쿼리 스트링 방식인지, 구형 단축코드 경로인지 자동으로 감별합니다. 구형 단축코드인 경우에는 기존처럼 Firestore를 조회하는 프로세스(Fallback)를 작동하므로 이전 링크도 완전한 호환성을 유지합니다.

**Q. WSS (WebSocket) 주소는 링크에 포함되어 있지 않은데 어떻게 연동하나요?**  
A. 보안 및 구성 간소화를 위해 WSS 주소는 링크에 담기지 않으며, 동적으로 생성하지도 않습니다. 필요시 웹앱 내에서 주입받은 `_backend`의 도메인을 치환하거나, 웹앱 내부 설정값을 기반으로 독립적으로 조립하여 사용해야 합니다.

---

## 6. 개발자별 상세 테스트 플랜 (Test Plan)

프론트엔드 및 모바일 개발자가 각각의 파트에서 신규 딥링크가 올바르게 작동하는지 수동 검증하기 위한 상세 시나리오입니다.

### [1] 프론트엔드 개발자 테스트 플랜

#### 시나리오 1: 랜딩 페이지 리다이렉션 파라미터 검증 (랜딩 -> 웹앱)

1. **로컬 랜딩 서버 실행**: 랜딩 페이지(`apps/landing`) 프로젝트를 로컬 포트 `5004` 등으로 기동합니다.
2. **테스트 URL 접속**: 브라우저 주소창에 아래와 같은 신규 규격 딥링크 주소를 입력하여 접속합니다.
    ```
    http://localhost:5004/s?code=invt:910001:local-test-key&api=vjgudphpo4&stage=dev
    ```
3. **리다이렉션 확인**: 즉시 메인 웹앱 주소로 페이지가 리다이렉트되는지 확인합니다.
4. **최종 주소창 검증**: 리다이렉트된 웹앱 브라우저 주소창에 아래 파라미터가 정확히 매핑되었는지 육안 점검합니다.
    - `code=invt%3A910001%3Alocal-test-key`
    - `provider=invite`
    - `version=2`
    - `_backend=https%3A%2F%2Fvjgudphpo4.execute-api.ap-northeast-2.amazonaws.com%2Fdev`

#### 시나리오 2: 구형 단축 링크 하위 호환성 검증

1. **구형 주소 접속**: 브라우저 주소창에 옛날 단축 형식의 주소를 입력합니다.
    ```
    http://localhost:5004/s/1000042
    ```
2. **동작 검증**: 개발자 도구의 Network 탭을 확인하여 Firestore 조회(Fallback) 로직이 트리거되고 기존 방식의 리다이렉션 및 파라미터 조립이 이루어지는지 검증합니다.

---

### [2] 모바일 네이티브 개발자 테스트 플랜

#### 시나리오 1: iOS/Android 시뮬레이터를 통한 신규 딥링크 진입 및 라우팅 검증

1. 에뮬레이터 또는 시뮬레이터를 구동한 상태에서 터미널을 열고 다음 명령어를 실행합니다.
    - **iOS 시뮬레이터**:
        ```bash
        xcrun simctl openurl booted "chatic://s?code=invt:910001:ios-sim-test&api=vjgudphpo4&stage=dev"
        ```
    - **Android 에뮬레이터**:
        ```bash
        adb shell am start -W -a android.intent.action.VIEW \
          -d "chatic://s?code=invt:910001:android-sim-test&api=vjgudphpo4&stage=dev" \
          io.chatic.dou
        ```
2. **검증 항목**:
    - 앱이 자동으로 실행되며 메인 웹뷰가 `/auth/login` 로그인 화면으로 정상 전환되는지 확인합니다.
    - 웹뷰에 전달되는 최종 URL에 `code=invt:910001:ios-sim-test` (혹은 `android-sim-test`), `provider=invite`, `version=2`, `_backend=https://vjgudphpo4.execute-api.ap-northeast-2.amazonaws.com/dev` 파라미터가 누락 없이 병합되어 주입되는지 Safari/Chrome 웹뷰 디버거를 통해 확인합니다.

#### 시나리오 2: Cold Start(앱 최초 구동) 시 딥링크 처리 검증

1. 시뮬레이터에서 테스팅 앱을 완전히 종료(Force Quit)합니다.
2. 위의 시뮬레이터 딥링크 트리거 명령어를 실행합니다.
3. **검증 항목**:
    - 앱이 처음 켜질 때 스플래시 화면을 지나 웹뷰가 최종 로그인 및 초대 화면으로 유실 없이 안전하게 랜딩되는지 확인합니다.

#### 시나리오 3: FCM 푸시 알림 배너 클릭 시 딥링크 연동 검증

1. 푸시 알림 테스트 툴을 이용하여 모바일 기기에 아래와 같은 형식의 `data` 페이로드가 실린 FCM 알림을 전송합니다.
    ```json
    {
        "deeplink": "chatic://s?code=invt:910001:push-test&api=vjgudphpo4&stage=dev"
    }
    ```
2. 기기 화면에 나타난 푸시 배너를 터치하여 클릭합니다. (앱이 백그라운드에 있을 때와 완전히 종료되었을 때 모두 각각 테스트 진행)
3. **검증 항목**:
    - `DeeplinkRoutingService.handleNotificationClick`이 호출되는지 네이티브 디버그 콘솔 로그를 확인합니다.
    - 배너 클릭을 통해 앱이 기상한 후, 웹뷰가 푸시 데이터에 지정된 초대 로그인 화면으로 오차 없이 전환되는지 검증합니다.
