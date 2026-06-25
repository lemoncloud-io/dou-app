# apps/web 디렉터리·프로젝트 구조 스펙

> 대상: `apps/web/src` · 참조 구현: `apps/testbed`
>
> 이 문서는 **"이 파일을 어디에 둘 것인가"의 단일 기준**이다. 신규 코드와 마이그레이션 모두 이 구조를 목표로 한다.

---

## 1. 전체 레이아웃

모든 애플리케이션 코드는 `src/app/` 하위에 둔다(Nx 관례). `src/`에는 엔트리·정적 자원만 둔다.

```
src/
  main.tsx · i18n/ · assets/ · styles.css · types/    # 엔트리 / 정적 (앱 코드 아님)
  app/
    app.tsx          # composition root — provider 조립만
    # ── 플랫폼 / 런타임 레이어 ──
    runtime/         # 세션 수명 + 소켓 연결: SessionGate, AppRuntime(RuntimeConnectionHost), useSocketDelegate
    bridge/          # 네이티브 메시지 단일 접점: outbound(appBridge) + inbound push 구독(useHandleAppMessage/useOn*) + GlobalBridgeListener
    monitoring/      # 계측: webVitals 등
    # ── 라우팅 ──
    routing/         # 라우트 트리 · 가드 · 경로 상수(paths) · 공개/비공개 분기
    # ── 도메인 ──
    features/<feature>/   # 도메인 슬라이스 (아래 §3)
    # ── 횡단 자원 (2개 이상 feature가 공유) ──
    ui/              # 횡단 presentational만 (로직·상태·util 금지)
      components/    #   횡단 합성 UI (BottomNavigation, Sidebar, 공용 다이얼로그 등)
      layouts/       #   앱 레이아웃 (Main/Private/Public/SafeArea 등)
    hooks/           # 횡단 훅만 — 관심사별 서브폴더로 그룹, 도메인 훅 금지(→ feature)
      native/        #   예: useBackHandler, useDeviceTokenRegistration
      ...            #   (유형이 늘 때 추가)
    stores/          # 전역 zustand (앱 환경설정, 온보딩 등)
    utils/           # 순수 util / consts
```

> **`shared/` 래퍼는 두지 않는다.** 횡단 자원은 `app/` 최상위 형제 디렉터리로 평면 전개한다 — `shared`가 도메인 코드까지 빨아들이는 junk-drawer가 되는 것을 막기 위함이다.

**bridge 레이어 사용 규칙**

네이티브 ↔ 웹 메시지는 `bridge/` 한 곳에서만 주고받는다. feature가 `webClient`를 직접 쓰지 않는다.

| 방향 | 패턴 | 언제 |
|------|------|------|
| Web → Native (응답 있음) | `await appBridge.method()` | 네이티브가 결과를 돌려주는 요청 (`FetchFcmToken`, `OAuthLogin`, `GetContacts` 등) |
| Web → Native (fire-and-forget) | `appBridge.method()` (void) | 결과 불필요 (`openURL`, `setBadgeCount`, `notifyWebAppReady` 등) |
| Native → Web (push) | `useOn<EventName>` | 네이티브가 먼저 보내는 이벤트 (`OnNavigate`, `OnBackgroundStatusChanged`, `OnUpdateDeviceInfo` 등) |

- `appBridge` = 모든 outbound 메서드의 단일 진입점. feature는 `appBridge.X()`만 호출한다.
- `useHandleAppMessage` / `useOn*` = inbound push 전용. request-response 흐름에는 쓰지 않는다.
- `GlobalBridgeListener` = 앱 전역에서 구독해야 하는 push 이벤트를 한데 모은 컴포넌트.
- **`Purchase` 예외**: 결과가 `OnPurchaseSuccess` / `OnPurchaseError` push 이벤트로 오므로 `appBridge.purchase()`는 void. feature에서 resolver ref 패턴으로 Promise화한다.

**횡단 디렉터리 규칙**

- `ui/` = **presentational만** (components·layouts·아이콘·테마). 훅·상태·util은 절대 넣지 않는다 — 이 경계가 `ui/`가 새 junk-drawer가 되는 것을 막는 가드. (primitive는 `@chatic/ui-kit` lib에 있고, `ui/`는 앱 전용 합성물만.)
- `hooks/` = **횡단 훅을 관심사별 서브폴더**(`native/`, `session/`…)로 묶는다. 단 도메인 훅은 여기 두지 않는다(→ `features/<feature>/hooks`). **수가 늘 때 묶는다** — 처음부터 빈 카테고리 폴더를 만들지 않는다(YAGNI).
- `utils/` = **앱 전용** 순수 util/consts만. 앱에 의존하지 않는 범용 순수함수(예: `debounce`)는 `@chatic/shared` lib **승격 후보**로 본다 — 지금 옮기진 않고 규칙만(다른 앱/lib이 같은 걸 필요로 할 때 승격).

---

## 2. 레이어와 의존 방향

```
features  ─────▶  횡단(ui/{components,layouts} · hooks · stores · utils)
   │                     ▲
   └──────────▶  runtime / bridge / monitoring / routing
```

- **의존은 단방향**: `features` → `횡단`/`플랫폼`. 역방향 금지(횡단·런타임은 특정 feature를 import하지 않는다).
- **feature 간 직접 import 금지**: 두 feature가 무언가를 공유해야 하면 횡단 디렉터리로 올리거나(승격), 공유 모델이면 그 자리에서 재배치한다. feature A가 feature B를 import하지 않는다.
- `routing`은 feature의 pages를 라우트에 연결한다(routing → features 참조는 허용 — 라우팅은 합성 지점).

---

## 3. feature 내부 표준

```
features/<feature>/
  pages/        # 라우트 진입 화면
  components/   # 이 feature 전용 UI
  hooks/        # 이 feature 전용 로직 훅 (web-core 호출을 감싸는 곳)
  model/        # 도메인 타입 / 상태 (엔티티)
  index.ts      # 공개 API barrel — 외부는 여기로만 import
```

- **`api/` 디렉터리는 없다.** 서버 호출은 `@chatic/web-core`가 담당한다. feature는 `hooks/`에서 web-core 훅/함수를 감싸고, `model/`에는 도메인 타입·상태만 둔다.
- **엔티티 = `model/`**. 별도 entities 레이어를 만들지 않는다. 한 feature 전용이면 `model/`, 2개 이상이 공유하면 횡단으로 승격한다.
- **공개 경계 = `index.ts` barrel (feature만 강제)**. feature 외부에서는 `features/<feature>` (barrel)로만 import하고, 내부 파일을 직접 경로로 꺼내지 않는다. 횡단 디렉터리·runtime/bridge 등은 barrel 자유(필수 아님).
- `app/ui/components`(횡단) 와 `features/<f>/components`(feature 전용)는 같은 이름이지만 경로로 스코프가 구분된다.

### feature 공개 API + 라우트 소유

- **모든 feature는 `index.ts`(barrel)를 가진다.** 외부(특히 `routing/`)는 이 barrel로만 feature에 접근하고, 내부 파일을 직접 경로로 꺼내지 않는다.
- **feature가 자기 라우트를 소유한다.** feature는 자신의 라우트 정의(`<Feature>Routes`)를 `index.ts`로 노출하고, `routing/`은 이를 **lazy import로 합성**만 한다(라우트 트리 자체를 routing이 모두 들고 있지 않음).
    ```tsx
    // routing/private/PrivateRoutes.tsx
    const ChatRoutes = lazy(() => import('../../features/chat').then(m => ({ default: m.ChatRoutes })));
    ```
- **barrel 노출 범위는 최소로**: 보통 `<Feature>Routes`만, 드물게 다른 feature/routing이 정말 필요로 하는 공개 컴포넌트 한둘. pages/components/hooks/model 내부는 비공개. (feature 간 직접 import은 §2에서 금지 — barrel이 그 경계를 물리적으로 강제한다.)

### data / sync 모듈은 feature hooks에서 wrapping (중앙 버킷 금지)

`@chatic/data`(repository-v2: `observeList`/`refreshList`/`sendChat`…)와 `@chatic/app-runtime`(sync: `getSyncManager`/`useChatSync`…)의 기능은 **각 feature의 `hooks/`에서 그 화면이 필요한 만큼만 조합해 쓴다.** 최상위 `app/hooks`에 `useChannels`/`useChats`/`usePlaces` 같은 카테고리별 중앙 훅을 두지 않는다.

이유: **`@chatic/data`·`@chatic/app-runtime` 자체가 이미 카테고리별 중앙 레이어다.** 그 위에 앱-레벨 중앙 훅 레이어를 또 두면 같은 레이어를 두 번 만드는 중복 인디렉션이고, 그 중간 버킷이 곧 junk-drawer(무한 증식·암묵적 결합·feature 이식성 상실)가 된다. colocation(feature 옆에 데이터 훅) 이 표준이다.

```
✅  features/chats/hooks/useChatRoom  →  repos.chat.observeList + useChatSync
❌  app/hooks/useChats               →  features 전부가 의존하는 중앙 버킷
```

예외: 2개 이상 feature가 **동일한** 데이터 훅을 쓸 때만 횡단(`app/hooks`)이나 공유 `model`로 승격한다(§4-4 "두 번째 소비자" 트리거). 기본은 feature, 승격은 예외.

### feature 내부: 화면별 colocation (fractal)

feature가 여러 화면을 가지면, **§4 결정 트리를 한 단계 아래에 그대로 재귀 적용**한다 — "한 화면 전용이면 그 화면 옆에(colocate), 2개+ 화면이 공유하면 feature 루트로".

`chat` feature 예시 (채팅방 / 채팅방 설정 / 초대 / 전송 팝업):

```
features/chat/
  pages/
    ChatRoomPage/              # 채팅방 (라우트 화면)
      ChatRoomPage.tsx
      MessageList.tsx          # 이 화면 전용 → colocate
      Composer.tsx
      SendChatPopup.tsx        # 전송 팝업 — 채팅방에서만 열면 여기
    ChatSettingsPage/          # 채팅방 설정 (라우트 화면)
      ChatSettingsPage.tsx
      InviteDialog.tsx         # 초대 — 설정에서만 열면 여기
  components/                  # 2개+ 화면이 공유하는 UI (MessageBubble 등)
  hooks/                       # 2개+ 화면이 공유하는 훅 (useChatRoom 등)
  model/                       # 도메인 타입/상태
  index.ts
```

배치 규칙(한 단계 아래):

1. 라우트 진입 화면 → `pages/<Screen>/`
2. 그 화면 1개 전용 컴포넌트/훅 → 그 화면 폴더에 colocate
3. feature 안 2개+ 화면이 공유 → feature 루트 `components/`·`hooks/`
4. 다른 feature도 사용 → app 최상위 횡단으로 승격(§4-4)

→ "초대"/"전송 팝업" 위치는 **누가 여느냐**로 갈린다: 한 화면만 열면 그 화면 폴더, 둘 이상이 열면 `components/`.

**깊이는 필요할 때 자라게 둔다(YAGNI).** 화면이 단순하면 폴더 만들지 말고 `pages/ChatRoomPage.tsx` 단일 파일로 시작 → 전용 부품이 생길 때 폴더로 승격. 빈 `components/`·`model/`을 미리 파지 않는다.

### 폴더 네이밍

- **컴포넌트 1개를 감싸는 폴더(page-as-folder)**: 그 컴포넌트와 동일한 **PascalCase** (`ChatRoomPage/ChatRoomPage.tsx`). 폴더↔컴포넌트 1:1.
- **도메인/레이어/표준 폴더**: **lowercase** (`chat/`, `pages/`, `components/`, `hooks/`, `model/`).
- 대소문자는 한 번 정한 규칙을 일관되게 유지한다(리눅스 CI는 대소문자 구분; `git config core.ignorecase false` 권장).

---

## 4. 배치 결정 트리

새 파일/심볼을 둘 곳을 정할 때:

1. **앱 시작·플랫폼 연결인가?** (부트스트랩, 소켓/세션, 네이티브 브릿지, 계측, 라우팅)
   → `runtime` / `bridge` / `monitoring` / `routing`
2. **한 도메인에서만 쓰는가?** → `features/<feature>/` 의 해당 하위(`pages`/`components`/`hooks`/`model`)
3. **2개 이상 feature가 공유하는가?** → 횡단(`ui/{components,layouts}` · `hooks` · `stores` · `utils`)
4. **애매하면** feature 안에 두고, **두 번째 소비자가 생길 때** 횡단(또는 `model`)으로 승격한다.

> 도메인 훅(`useChannels`, `useChats`, `usePlaces` …)은 **2번**이다 — `features/<feature>/hooks`. `app/hooks`(횡단)에 두지 않는다.

---

## 5. 적용 상태와 마이그레이션

- 이 구조 중 `runtime`·`bridge`·`monitoring`·`routing`·`features`·`stores`·`utils`는 이미 존재한다.
- **남은 정렬(점진 적용)**:
    - `routes/` → `routing/` 개명.
    - `shared/{components,hooks,layouts}` → `app/{components,hooks,layouts}` 로 끌어올림(`shared/` 래퍼 제거).
    - `shared/hooks`에 섞인 도메인 훅 → 각 `features/<feature>/hooks`로 이전 (§4 2번).
- **일괄 이동하지 않는다.** 진행 중인 socket→runtime 마이그레이션에서 각 파일을 건드릴 때 위 규칙에 맞춰 함께 옮긴다(playbook 절차에 흡수). 이 문서는 그 목표 위치의 기준이다.

---

## 6. 자가 점검

구조가 제 역할을 하는지 확인: 아래 3개를 §4 결정 트리로 즉답할 수 있어야 한다.

- 새 도메인 훅 `useFooList` → `features/foo/hooks` (2번)
- 두 화면이 쓰는 확인 다이얼로그 → `app/ui/components` (3번)
- 전역 환경설정 store → `app/stores` (3번)
