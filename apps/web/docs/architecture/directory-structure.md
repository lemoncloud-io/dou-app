# 디렉터리·프로젝트 구조

> 대상: `apps/web/src` · 참조 구현: `apps/testbed`
>
> 이 문서는 **"이 파일을 어디에 둘 것인가"의 단일 기준**이다.

---

## 1. 전체 레이아웃

모든 애플리케이션 코드는 `src/app/` 하위에 둔다(Nx 관례). `src/`에는 엔트리·정적 자원만 둔다.

```
src/
  main.tsx · i18n/ · assets/ · styles.css · types/    # 엔트리 / 정적 (앱 코드 아님)
  app/
    app.tsx          # composition root — provider 조립만
    # ── 플랫폼 / 런타임 레이어 ──
    runtime/         # 세션 수명 + 소켓 연결: AppRuntime, AppReadyGate, useSocketDelegate, PreferenceLoader
    bridge/          # 네이티브 메시지 단일 접점 (→ bridge.md)
    monitoring/      # 계측: webVitals 등
    # ── 라우팅 ──
    routes/          # 라우트 트리 · 가드 · 경로 상수(paths) · 공개/비공개 분기 (→ routing.md)
    # ── 도메인 ──
    features/<feature>/   # 도메인 슬라이스 (아래 §3)
    # ── 횡단 자원 (2개 이상 feature가 공유) ──
    ui/              # 횡단 presentational만 (로직·상태·util 금지)
      components/    #   횡단 합성 UI (BottomNavigation, Sidebar, 공용 다이얼로그 등)
      layouts/       #   앱 레이아웃 (Main/Private/Public/SafeArea 등)
    hooks/           # 횡단 훅만 — 관심사별 서브폴더로 그룹, 도메인 훅 금지(→ feature)
      native/        #   예: useBackHandler (네이티브 push 등록은 bridge/ 에 둔다)
    stores/          # 전역 zustand (앱 환경설정 등 → stores.md)
    utils/           # 순수 util / consts
```

> **`shared/` 래퍼는 두지 않는다.** 횡단 자원은 `app/` 최상위 형제 디렉터리로 평면 전개한다 — `shared`가 도메인 코드까지 빨아들이는 junk-drawer가 되는 것을 막기 위함이다.

**횡단 디렉터리 규칙**

- `ui/` = **presentational만** (components·layouts·아이콘·테마). 훅·상태·util은 절대 넣지 않는다 — 이 경계가 `ui/`가 새 junk-drawer가 되는 것을 막는 가드. (primitive는 `@chatic/ui-kit` lib에 있고, `ui/`는 앱 전용 합성물만.)
- `hooks/` = **횡단 훅을 관심사별 서브폴더**로 묶는다. 도메인 훅은 여기 두지 않는다(→ `features/<feature>/hooks`). **수가 늘 때 묶는다** — 처음부터 빈 카테고리 폴더를 만들지 않는다(YAGNI).
- `utils/` = **앱 전용** 순수 util/consts만. 앱에 의존하지 않는 범용 순수함수는 `@chatic/shared` lib **승격 후보**(다른 앱/lib이 같은 걸 필요로 할 때 승격).

---

## 2. 레이어와 의존 방향

```
features  ─────▶  횡단(ui/{components,layouts} · hooks · stores · utils)
   │                     ▲
   └──────────▶  runtime / bridge / monitoring / routes
```

- **의존은 단방향**: `features` → `횡단`/`플랫폼`. 역방향 금지.
- **feature 간 직접 import 금지**: 두 feature가 공유해야 하면 횡단으로 올린다(승격). feature A가 feature B를 import하지 않는다.
- `routes`는 feature의 pages를 라우트에 연결한다(`routes → features` 허용 — 라우팅은 합성 지점).

---

## 3. feature 내부 표준

```
features/<feature>/
  pages/        # 라우트 진입 화면
  components/   # 이 feature 전용 UI
  hooks/        # 이 feature 전용 로직 훅 (web-core 호출을 감싸는 곳)
  types/        # 도메인 타입 / 상태 (엔티티) — 이 feature 전용 타입 전부
  consts/       # 이 feature 전용 상수 (환경 분기·매직값·허용 목록 등)
  index.ts      # 공개 API barrel — 외부는 여기로만 import
```

- **`api/` 디렉터리는 없다.** 서버 호출은 `@chatic/web-core`/`@chatic/data`가 담당한다. feature는 `hooks/`에서 web-core/repository 훅을 감싸고, `types/`에는 도메인 타입·상태만 둔다.
- **엔티티 = `types/`**. 별도 `entities/`·`model/` 레이어를 만들지 않는다. 한 feature 전용이면 `types/`, 2개 이상이 공유하면 횡단으로 승격한다.
- **훅은 `hooks/`로, 타입은 `types/`로, 상수는 `consts/`로 모은다.** 페이지·컴포넌트에 도메인 타입/공용 상수를 인라인으로 흩지 않는다.
- **공개 경계 = `index.ts` barrel (feature만 강제)**. feature 외부는 barrel로만 import하고 내부 파일을 직접 경로로 꺼내지 않는다. 횡단·runtime/bridge 등은 barrel 자유.

### feature 공개 API + 라우트 소유

- **모든 feature는 `index.ts`(barrel)를 가진다.** 외부(특히 `routes/`)는 이 barrel로만 접근한다.
- **feature가 자기 라우트를 소유한다.** feature는 라우트 정의(`<Feature>Routes`)를 `index.ts`로 노출하고, `routes/`은 이를 **lazy import로 합성**만 한다.
    ```tsx
    // routes/private/PrivateRoutes.tsx
    const ChannelRoutes = lazy(() => import('../../features/channels').then(m => ({ default: m.ChannelRoutes })));
    ```
- **barrel 노출 범위는 최소로**: 보통 `<Feature>Routes`만, 드물게 다른 routing이 정말 필요로 하는 공개 컴포넌트 한둘.

### data / sync 모듈은 feature hooks에서 wrapping (중앙 버킷 금지)

`@chatic/data`(`observeList`/`refreshList`/`sendChat`…)와 `@chatic/app-runtime`(sync: `getSyncManager`/`useChatSync`…)의 기능은 **각 feature의 `hooks/`에서 그 화면이 필요한 만큼만 조합해 쓴다.** 최상위 `app/hooks`에 `useChannels`/`useChats`/`usePlaces` 같은 카테고리별 중앙 훅을 두지 않는다.

이유: **`@chatic/data`·`@chatic/app-runtime` 자체가 이미 카테고리별 중앙 레이어다.** 그 위에 앱-레벨 중앙 훅 레이어를 또 두면 같은 레이어를 두 번 만드는 중복 인디렉션이고, 그 중간 버킷이 곧 junk-drawer가 된다. colocation(feature 옆에 데이터 훅)이 표준이다.

```
✅  features/channels/hooks/useChannelRoom  →  repos.chat.observeList + useChatSync
❌  app/hooks/useChats                       →  features 전부가 의존하는 중앙 버킷
```

예외: 2개 이상 feature가 **동일한** 데이터 훅을 쓸 때만 횡단(`app/hooks`)이나 공유 `types`로 승격한다(§4-4 "두 번째 소비자" 트리거).

### feature 내부: 화면별 colocation (fractal)

feature가 여러 화면을 가지면, **§4 결정 트리를 한 단계 아래에 그대로 재귀 적용**한다 — "한 화면 전용이면 그 화면 옆에(colocate), 2개+ 화면이 공유하면 feature 루트로".

```
features/channels/
  pages/
    ChannelRoomPage/           # 채팅방 (라우트 화면)
      ChannelRoomPage.tsx
      MessageList.tsx          # 이 화면 전용 → colocate
      Composer.tsx
    ChannelSettingsPage/       # 채팅방 설정 (라우트 화면)
      ChannelSettingsPage.tsx
      InviteDialog.tsx         # 초대 — 설정에서만 열면 여기
  components/                  # 2개+ 화면이 공유하는 UI
  hooks/                       # 2개+ 화면이 공유하는 훅
  types/ · consts/ · index.ts
```

배치 규칙(한 단계 아래):

1. 라우트 진입 화면 → `pages/<Screen>/`
2. 그 화면 1개 전용 컴포넌트/훅 → 그 화면 폴더에 colocate
3. feature 안 2개+ 화면이 공유 → feature 루트 `components/`·`hooks/`
4. 다른 feature도 사용 → app 최상위 횡단으로 승격(§4-4)

**깊이는 필요할 때 자라게 둔다(YAGNI).** 화면이 단순하면 `pages/Foo.tsx` 단일 파일로 시작 → 전용 부품이 생길 때 폴더로 승격. 빈 `components/`·`types/`·`consts/`를 미리 파지 않는다.

### 폴더 네이밍

- **컴포넌트 1개를 감싸는 폴더(page-as-folder)**: 그 컴포넌트와 동일한 **PascalCase** (`ChannelRoomPage/ChannelRoomPage.tsx`).
- **도메인/레이어/표준 폴더**: **lowercase** (`channels/`, `pages/`, `components/`, `hooks/`, `types/`, `consts/`).
- 대소문자는 일관되게 유지(리눅스 CI는 대소문자 구분; `git config core.ignorecase false` 권장).

---

## 4. 배치 결정 트리

새 파일/심볼을 둘 곳을 정할 때:

1. **앱 시작·플랫폼 연결인가?** (부트스트랩, 소켓/세션, 네이티브 브릿지, 계측, 라우팅) → `runtime` / `bridge` / `monitoring` / `routes`
2. **한 도메인에서만 쓰는가?** → `features/<feature>/`의 해당 하위(`pages`/`components`/`hooks`/`types`/`consts`)
3. **2개 이상 feature가 공유하는가?** → 횡단(`ui/{components,layouts}` · `hooks` · `stores` · `utils`)
4. **애매하면** feature 안에 두고, **두 번째 소비자가 생길 때** 횡단(또는 `types`)으로 승격한다.

> 도메인 훅(`useChannelRoom`, `usePlaceList` …)은 **2번**이다 — `features/<feature>/hooks`. `app/hooks`(횡단)에 두지 않는다.

---

## 5. 자가 점검

구조가 제 역할을 하는지 확인: 아래 3개를 §4 결정 트리로 즉답할 수 있어야 한다.

- 새 도메인 훅 `useFooList` → `features/foo/hooks` (2번)
- 두 화면이 쓰는 확인 다이얼로그 → `app/ui/components` (3번)
- 전역 환경설정 store → `app/stores` (3번)
