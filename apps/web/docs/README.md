# apps/web 문서

`apps/web`는 Chatic 웹 클라이언트(React + Vite)다. 네이티브 앱의 WebView로도, 일반 웹으로도 동작한다. 세션·인증·데이터·소켓은 직접 들고 있지 않고 라이브러리에 위임한다.

- **`@chatic/web-core`** — relay/cloud 세션, 인증, 선택 상태(cid·sid·uid), 토큰
- **`@chatic/app-runtime`** — 런타임 바인딩, 소켓 수명, repository, sync
- **`@chatic/data`** — repository fetch, 로컬 캐시 CRUD, observe 스트림

앱은 이 위에서 **화면과 라우트**를 조립한다. 데이터는 repository observe로 읽고, sync로 갱신을 등록하고, 쓰기는 repository로 한다.

## 핵심 개념

### 도메인 용어

| 용어        | 의미                                                                      |
| ----------- | ------------------------------------------------------------------------- |
| **Cloud**   | 하나의 워크스페이스. 사용자는 여러 Cloud에 소속 가능.                     |
| **Place**   | Cloud 안의 하위 그룹. 백엔드 모델명은 `site` — 코드에서 `place === site`. |
| **Channel** | Place 안의 채팅방. 1:1, 그룹, self 채팅 등.                               |
| **Join**    | 사용자와 채널의 관계. `readNo`(마지막 읽은 chatNo) 등 포함.               |

### relay 모드 vs cloud 모드

앱은 두 접속 모드를 가진다. 활성 모드는 `useGlobalSession().activeServer.kind`(`'relay'` \| `'cloud'`)로 판별한다.

- **relay 모드** — Cloud 미선택(또는 `cloudId === 'default'`). 중계 서버에 붙고, relay 세션 토큰으로 인증한다. 기준(fallback) 세션이다.
- **cloud 모드** — 특정 Cloud에 접속. Cloud 전용 백엔드(delegation token의 wss)에 붙고, cloud identity token으로 인증한다. Place 전환 시 재인증한다.

전환·재인증은 `@chatic/web-core`/`@chatic/app-runtime`이 담당한다. 앱은 전환 훅만 호출하고 수동으로 토큰/소켓을 만지지 않는다([architecture/data-flow.md](./architecture/data-flow.md)).

### 부트스트랩

`app.tsx`는 `RuntimeConnectionHost`(선언형 provider)로 런타임을 조립한다. init/keepalive/token-refresh/소켓 재인증은 런타임 내부에서 자동으로 돈다. 자세한 흐름은 [architecture/README.md](./architecture/README.md).

## 문서 맵

### 횡단 아키텍처 — [`architecture/`](./architecture/)

- [README](./architecture/README.md) — 레이어 경계와 의존 방향
- [directory-structure](./architecture/directory-structure.md) — "이 파일 어디 두지?"의 단일 기준
- [data-flow](./architecture/data-flow.md) — observe/sync/refresh 데이터 흐름, 리프레시 타이밍, 델타 동기화
- [routing](./architecture/routing.md) — 3-tier 라우팅과 `ROUTES` 빌더
- [bridge](./architecture/bridge.md) — 네이티브 ↔ 웹 메시지 단일 접점
- [stores](./architecture/stores.md) — 전역 preference store

### 기능 — [`feature/`](./feature/)

각 폴더는 `src/app/features/<name>`과 1:1이다.

| feature                                          | 설명                                     |
| ------------------------------------------------ | ---------------------------------------- |
| [account](./feature/account/README.md)           | 가입 · 비밀번호 재설정(이메일 인증 흐름) |
| [auth](./feature/auth/README.md)                 | 로그인 · 세션 위임 · 초대 수락           |
| [channels](./feature/channels/README.md)         | 채널 목록 · 채팅방 · 설정                |
| [debug](./feature/debug/README.md)               | 개발자 도구(런타임 언락)                 |
| [feedback](./feature/feedback/README.md)         | 의견 보내기(로그 · 디바이스 자동 첨부)   |
| [home](./feature/home/README.md)                 | 메인 탭 · 목록 · 클라우드 전환 시트      |
| [mypage](./feature/mypage/README.md)             | 계정 · 정책 허브                         |
| [onboarding](./feature/onboarding/README.md)     | 최초 실행 온보딩 게이트                  |
| [place](./feature/place/README.md)               | Place(=Site) 상세·편집                   |
| [subscription](./feature/subscription/README.md) | 구독 현황 · 플랜 · IAP                   |

## 라이브러리 문서

앱이 의존하는 라이브러리의 공식 가이드:

- [`libs/app-runtime/docs`](../../../libs/app-runtime/docs/README.md) — 세션 허브 · runtime · socket · http · data
- [`libs/data/docs`](../../../libs/data/docs) — repository · local/remote data source
- [`libs/logger/docs`](../../../libs/logger/docs/architecture.md) — 통합 로깅
