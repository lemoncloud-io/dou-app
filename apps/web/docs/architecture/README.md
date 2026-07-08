# 아키텍처

`apps/web`의 횡단(cross-cutting) 구조를 다룬다. 특정 feature가 아니라 앱 전체에 걸치는 경계·규칙이다.

- [directory-structure](./directory-structure.md) — 파일 배치 단일 기준 (레이어 · feature 표준 · 결정 트리)
- [data-flow](./data-flow.md) — observe/sync/refresh 데이터 흐름, 리프레시 타이밍, 델타 동기화, 로그아웃 캐시
- [routing](./routing.md) — 3-tier 라우팅과 `ROUTES` 빌더
- [bridge](./bridge.md) — 네이티브 ↔ 웹 메시지 단일 접점
- [stores](./stores.md) — 전역 preference store
- [theme](./theme.md) — 테마 상태·적용·bridge 동기화

## 레이어 경계

앱은 세션·소켓·데이터를 직접 들고 있지 않는다. 세 라이브러리에 위임하고, 그 위에서 화면을 조립한다.

```
apps/web
 ├─ web-core      : relay/cloud 세션, activeServer, 선택 상태(cid/sid/uid), 토큰
 ├─ app-runtime   : runtime binding, socket lifecycle, repository, sync
 └─ data          : repository fetch, 로컬 캐시 CRUD, observe 스트림, DB
```

| 레이어          | 책임                                                                                |
| --------------- | ----------------------------------------------------------------------------------- |
| **web-core**    | 세션 상태/인증/선택(cid·sid·uid)의 단일 기준. 세션 변경은 반드시 세션 훅 경유.      |
| **app-runtime** | `RuntimeConnectionHost`로 부트스트랩, 소켓 수명·재인증, repository/sync 제공.       |
| **data**        | repository V2(`observeList`/`observeItem`/`refreshList`/`sendChat` 등) + 로컬 캐시. |
| **app(web)**    | 화면/라우트. observe로 읽고, sync로 갱신을 등록하고, 쓰기는 repository로.           |

## 의존 방향

```
features  ─────▶  횡단(ui/{components,layouts} · hooks · stores · utils)
   │                     ▲
   └──────────▶  runtime / bridge / monitoring / routes
```

- **단방향**: `features` → `횡단`/`플랫폼`. 역방향 금지(횡단·런타임은 특정 feature를 import하지 않는다).
- **feature 간 직접 import 금지**: 공유가 필요하면 횡단으로 승격한다.
- `routes`는 feature의 pages를 합성하는 지점이므로 `routes → features` 참조만 허용.

## 절대 규칙

- **`libs/socket`(`@chatic/socket`) 직접 접근 금지.** 소켓은 `@chatic/app-runtime`이 추상화한다. 앱은 `useSocketState`/repository/sync 훅만 쓴다.
- **web-core core 객체 직접 사용 금지**: `cloudCore`/`identityCore`/`relayCore`/`webCore`는 공개 API가 아니다. 공개 훅/서비스로만 접근.
- **세션 선택 상태(cloud/site)를 직접 setter로 바꾸지 않는다.** 전환 훅(`useSwitchCloudSession`/`useSiteSwitch`/`useRefreshCloudSiteSession`)으로만 변경.
- **코드 주석은 영어, 문서/대화는 한국어.**

## 참조 구현

`apps/testbed`가 이 아키텍처의 참조 구현이다. 특히 `app.tsx`(부트스트랩), `pages/ChatHomePage.tsx`(observe/sync/리프레시 종합), `pages/CreateChannelPage.tsx`(채팅 sync/전송)를 본다.
