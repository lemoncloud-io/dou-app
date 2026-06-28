# apps/web 런타임 마이그레이션 가이드 (socket → app-runtime / data)

> 대상: `apps/web` · 참조 구현: `apps/testbed`(최신) · 라이브러리: `@chatic/app-runtime`, `@chatic/data`, `@chatic/web-core`

이 문서는 `apps/web`를 레거시 `@chatic/socket` 의존에서 떼어내 `@chatic/app-runtime` + `@chatic/data` + `@chatic/web-core`로 옮길 때 따라야 할 **표준 패턴**을 정리한다. 모든 패턴은 최신 `apps/testbed` 구현에서 검증된 것이며, 파일 근거를 함께 표기한다.

> **원칙: `libs/socket`(`@chatic/socket`)에는 직접 접근하지 않는다.** 소켓은 `@chatic/app-runtime`이 추상화하며, 앱은 `useSocketState`/repository/sync 훅만 사용한다.

---

## 1. 목표 아키텍처와 계층 책임

```
apps/web
 ├─ web-core      : relay/cloud 세션, activeServer, 선택 상태(cid/sid), 토큰
 ├─ app-runtime   : runtime binding, socket lifecycle, repository, sync
 └─ data          : repository fetch, local cache CRUD, observe 스트림, DB
```

- **web-core** — 세션 상태/인증/선택(cid·sid·uid)의 단일 기준. 세션 변경은 반드시 `session/services`(= 세션 훅) 경유.
- **app-runtime** — `RuntimeConnectionHost`로 부트스트랩, 소켓 수명·재인증, repository/sync 제공.
- **data** — repository V2(`observeList`/`observeItem`/`refreshList`/`sendChat` 등) + 로컬 캐시.
- **app(web)** — 화면/라우트. 데이터는 repository observe로 읽고, sync로 갱신을 등록하고, 쓰기는 repository로 한다.

근거: `libs/app-runtime/docs/architecture.md`, `libs/web-core/docs/session/context-model.md`, `apps/testbed/docs/architecture.SPEC.md`

---

## 2. 부트스트랩 — `RuntimeConnectionHost` + `useSocketDelegate`

명령형 `getRuntimeManager().ensure()` + 조건부 `WebSocketV2Connection`을 **선언형 provider**로 교체한다. `RuntimeConnectionHost`가 내부에서 `TransportBootstrap`/`SessionBackgroundRunner`/`RuntimeDataBinder`/`SocketBinder`/`SocketAuthBinder`를 조립하므로, 앱이 init/keepalive/token-refresh를 수동 마운트할 필요가 없다.

```tsx
// app.tsx (testbed 패턴)
import { RuntimeConnectionHost, useRuntimeBinding, useSocketState } from '@chatic/app-runtime';
import { useSocketDelegate } from './hooks/useSocketDelegate';

function AppInner() {
    const binding = useRuntimeBinding(); // web-core activeServer/identity 관측 → cid/sid/uid + socket config
    const delegate = useSocketDelegate(); // 토큰 getter/refresh

    return (
        <RuntimeConnectionHost binding={binding} delegate={delegate}>
            <BrowserRouter>
                <Routes />
            </BrowserRouter>
        </RuntimeConnectionHost>
    );
}
```

```ts
// hooks/useSocketDelegate.ts (testbed에서 그대로 이식)
import { useMemo } from 'react';
import type { SocketSessionDelegate } from '@chatic/app-runtime';
import { getActiveServerIdentityToken, getGlobalSessionContext, useRefreshCloudSiteSession } from '@chatic/web-core';

export const useSocketDelegate = (): SocketSessionDelegate => {
    const { refreshSiteSession } = useRefreshCloudSiteSession();
    return useMemo(
        () => ({
            getSocketToken: async () => getActiveServerIdentityToken(),
            refreshSocketToken: async () => {
                const siteId = getGlobalSessionContext().activeServer.siteId;
                if (siteId) await refreshSiteSession(siteId);
                return getActiveServerIdentityToken();
            },
        }),
        [refreshSiteSession]
    );
};
```

**재인증은 자동이다.** 사이트/클라우드 전환으로 `sid`/토큰이 바뀌면 `SocketAuthBinder`가 감지해 `updateAuth('session-switch')`를 호출한다. 앱이 수동으로 `auth:update`를 보내면 안 된다(이중 발화).

근거: `apps/testbed/src/app/app.tsx`, `apps/testbed/src/app/hooks/useSocketDelegate.ts`, `libs/app-runtime/docs/runtime/session-runner.md`, `libs/app-runtime/docs/runtime/data-context-improvement.md:313-409`

---

## 3. 연결/세션 상태 읽기

`@chatic/socket`의 `useWebSocketV2Store`는 더 이상 쓰지 않는다. 상태는 두 출처에서 파생한다.

| 필요한 값                                            | 출처                                                                                                      |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `isVerified`, `isConnected`, `state`, `connectionId` | `useSocketState()` (`@chatic/app-runtime`)                                                                |
| `selectedSiteId`(=selectedPlaceId)                   | `useSessionSelection().selectedSiteId` (`@chatic/web-core`)                                               |
| `selectedCloudId`(=cloudId)                          | `useSessionSelection().selectedCloudId`, 또는 `session.activeServer.kind==='cloud' ? cloudId : 'default'` |
| `wssType`                                            | `useGlobalSession().activeServer.kind` (`'relay'`\|`'cloud'`)                                             |
| `isDeviceRegistered`                                 | **노출되지 않음** — device 등록은 런타임 내부. 게이팅 제거                                                |

> `isVerified`는 "이 연결에 대해 `auth.update`가 ok된 시점"을 뜻한다. 소켓 게이트웨이를 거치는 네트워크 호출(목록 fetch 등)은 `isVerified` 이후에 실행해야 새 세션 기준으로 동작한다.

근거: `apps/testbed/src/app/pages/ChatHomePage.tsx:32-48`, `libs/app-runtime/docs/socket/socket.md:66-76`, `libs/web-core/docs/session/public-api.md`

---

## 4. 데이터 읽기 — observe 구독 + sync 등록

수동 refresh/폴링과 `isConnected`/`isVerified` 게이팅을 걷어내고, **repository observe 구독 + sync 등록** 모델로 바꾼다.

- **observe**: UI는 `repos.<entity>.observeList(query, cb)` / `observeItem(id, cb)`만 구독한다. 캐시가 바뀌면(스스로의 refresh로든 sync push로든) 콜백이 다시 불린다.
- **sync 등록**: 화면 수명에 맞춰 sync 타깃을 등록하면 polling + push + 재연결 catch-up이 자동으로 돈다.
    - 단일 고정 id: `useChatSync(channelId)` / `useChannelSync(channelId)` / `usePlaceSync(placeId)` / `useProfileSync(profileId)` / `useJoinSync(channelId)`
    - 동적 목록: `getSyncManager().registerChannel(id)` / `registerPlace(id)` 등을 id 배열에 대해 등록하고 dispose 반환값으로 정리

```tsx
// 동적 목록 등록 예 (ChatHomePage)
useEffect(() => {
    if (siteIds.length === 0) return;
    const sync = getSyncManager();
    const disposers = siteIds.map(id => sync.registerPlace(id));
    return () => disposers.forEach(d => d());
}, [siteIdsKey]);
```

**채팅방**: 초기 메시지 로딩 fetch는 sync 등록 계층(`useChatSync`)이 소유한다. 페이지는 `chat.refreshList`를 초기 로딩용으로 부르지 않고, `observeList({channelId, limit})`만 구독한다. **과거 페이징만** `repos.chat.refreshList({channelId, cursorNo, limit})`를 명시 호출하고 observe 윈도우(limit)를 넓힌다.

근거: `apps/testbed/src/app/pages/CreateChannelPage.tsx:72-132,258-286`, `libs/app-runtime/docs/sync/domain-sync-and-plans.md`

---

## 5. 데이터 쓰기 — 전부 repository 경유

직접 socket `send`/`emit`/`emitAuthenticated`는 금지. 모든 쓰기는 `useRuntimeRepositories()`의 repository 메서드로 한다.

| 작업                            | repository 메서드                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| 메시지 전송                     | `repos.chat.sendChat({ channelId, content })`                                                |
| 읽음 처리                       | `repos.join.readChat({ channelId, chatNo })`                                                 |
| 채널 생성/수정/초대/나가기/삭제 | `repos.channel.createChannel`/`updateChannel`/`inviteChannel`/`leaveChannel`/`deleteChannel` |
| 사이트(place) 생성/수정/삭제    | `repos.place.createPlace`/`updatePlace`/`deletePlace`                                        |
| 프로필 수정                     | `repos.user.updateProfile(...)` 또는 `repos.profile.setMyProfile(...)`                       |
| 초대 요청                       | `repos.user.requestInvite` / `requestInviteBatch`                                            |

> `auth:update` 송신은 데이터 쓰기가 아니라 재인증이며 `SocketAuthBinder`가 자동 처리한다 — 앱에서 보내지 않는다.

근거: `apps/testbed/src/app/pages/CreateChannelPage.tsx:299-313`, `libs/data/src/data/repositories-v2/*`

---

## 6. 리프레시 타이밍 정책 ⭐

site / profile / channel 리프레시는 **세 타이밍**에 수행한다. 핵심: sync 런타임은 소켓 교체(재연결/재인증) 시에만 등록 타깃을 자동 replay하고, `sid`/`cid` 컨텍스트 변경만으로는 자동 재fetch하지 않는다. 따라서 (a)·(b)는 **명시적 `refresh*` 호출이 필수**다.

리프레시 묶음(`refreshActiveLists`) — channel/profile은 **syncMeta 델타 동기화**를 사용한다(§6.1):

```ts
const refreshActiveLists = useCallback(async () => {
    void repos.place.refreshList().catch(() => {}); // place는 델타 게이트웨이 없음 → full
    if (!activeSiteId) return;
    await syncChannelsDelta(cid); // channel: getSyncedAt→syncChannels→setSyncedAt
    await syncProfilesDelta(cid, activeSiteId); // profile: 동일 패턴, sid 스코프
}, [repos, cid, activeSiteId]);
```

### (a) 앱 진입 + (b) 사이트/클라우드 전환 확정 완료 — `isVerified` 상승 엣지

둘 다 **`useSocketState().isVerified`의 false→true 상승 엣지** 하나로 포착한다. 사이트/클라우드 전환은 재인증을 거치므로 `isVerified`가 하강 후 재상승한다 = "전환 확정 완료". 상승 엣지에서만 부르므로, 전환 낙관 구간(아직 옛 세션이 `verified=true`)에는 fetch하지 않아 이전 사이트/클라우드 데이터가 새 `sid`/`cid`로 오염되지 않는다.

```ts
const prevVerifiedRef = useRef(false);
useEffect(() => {
    const becameVerified = !prevVerifiedRef.current && isVerified;
    prevVerifiedRef.current = isVerified;
    if (becameVerified) refreshActiveLists();
}, [isVerified, refreshActiveLists]);
```

### (c) 주기 폴링 — 두 계층

1. **리스트 발견 폴링** — 명시적 `setInterval`로 `refreshActiveLists` 재호출. 추가/삭제된 목록 항목을 재발견하는 용도. **전환 진행 중(`isSwitching`/`isSiteSwitching`)에는 skip**(낙관 구간 stale fetch 방지).

```ts
const LIST_REFRESH_POLL_MS = 30_000;
useEffect(() => {
    if (!isVerified || isSiteSwitching || isSwitching) return;
    const timer = setInterval(refreshActiveLists, LIST_REFRESH_POLL_MS);
    return () => clearInterval(timer);
}, [isVerified, isSiteSwitching, isSwitching, refreshActiveLists]);
```

2. **per-item 실시간 폴링** — 보이는 항목별 `sync.registerChannel(id)`/`registerPlace(id)` 등록(기본 5s, idle backoff 60s). `lastChat$`·메타 등 항목 내부 변화를 실시간 갱신.

> **mis-tag 주의**: 전환 직후 observe 콜백은 비동기라 잠시 이전 사이트 채널을 들고 있을 수 있다. 반드시 `channel.sid === activeSiteId`로 필터하고 **활성 사이트 채널만 sync 등록**한다 — 아니면 sync push가 이전 채널을 새 `sid`로 mis-tag해 목록이 오염된다.

근거: `apps/testbed/src/app/pages/ChatHomePage.tsx:18-20,85-151`

### 6.1 channel / profile 델타 동기화 (syncMeta)

channel·profile은 full fetch 대신 **syncMeta cursor 기반 델타 동기화**를 쓴다. cursor를 `syncMeta` 레포에 저장해 매번 증분만 받는다(`apps/web useChannels.ts:189-204`에 동일 루프 존재 → 공용 헬퍼로 추출해 재사용).

```ts
// channel: 클라우드 전역 델타
const kind = `channel-sync:${cid}`;
const since = await repos.syncMeta.getSyncedAt(kind);
const { syncedAt } = await repos.channel.syncChannels(since); // ChannelRepositoryV2.syncChannels
await repos.syncMeta.setSyncedAt(kind, syncedAt);

// profile: sid 스코프 델타
const pKind = `profile-sync:${cid}:${sid}`;
const pSince = await repos.syncMeta.getSyncedAt(pKind);
const { syncedAt: pAt } = await repos.profile.syncProfiles(pSince); // ProfileRepositoryV2.syncProfiles
await repos.syncMeta.setSyncedAt(pKind, pAt);
```

- cursor kind 키는 스코프를 반영: channel은 `${cid}`, profile은 `${cid}:${sid}`. 전환 시 키가 새 cid/sid로 바뀌어 교차 오염을 막는다.
- `syncChannels`는 클라우드 전역 델타(캐시는 cloud-wide), sid 스코프 UI는 `observeList({sid})`가 필터한다.
- place는 델타 게이트웨이가 없어 `place.refreshList`(full)을 유지한다.

근거: `libs/data/src/data/repositories-v2/{SyncMetaRepositoryV2.ts:5-8,ChannelRepositoryV2.ts:127-158,ProfileRepositoryV2.ts:154-167}`, `apps/web/src/app/shared/hooks/useChannels.ts:189-204`

---

## 7. `@chatic/socket` 심볼 → 대체 매핑

| 레거시 (`@chatic/socket`)                                     | 대체                                                                       |
| ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `useWebSocketV2().{isConnected,connectionStatus}`             | `useSocketState()`                                                         |
| `useWebSocketV2().{send,emit,emitAuthenticated}`              | repository 메서드(쓰기) / 재인증은 `SocketAuthBinder` 자동                 |
| `useWebSocketV2Store(s => s.isVerified/isConnected)`          | `useSocketState()`                                                         |
| `useWebSocketV2Store(s => s.selectedPlaceId/cloudId/wssType)` | `useSessionSelection()` / `useGlobalSession().activeServer`                |
| `useWebSocketV2Store.subscribe(...)`                          | `getSocketManager().subscribe(...)` 또는 `useSocketState()`                |
| `setSelectedPlaceId(...)`                                     | `useSiteSwitch().switchSite(siteId)`                                       |
| 클라우드 전환                                                 | `useSwitchCloudSession().switchCloud(cloudId)` / `useLogoutCloudSession()` |
| `checkSocketHealth()`                                         | `useSocketState().isConnected` / `getSocketManager().getSnapshot()`        |
| `getSocketSend()` + 수동 `auth:update`                        | 제거 (`SocketAuthBinder` 자동 재인증)                                      |
| `useInitWebSocket` / `useWebSocketStore` (v1)                 | 제거 (`RuntimeConnectionHost`)                                             |
| `isDeviceRegistered`                                          | 제거 (런타임 내부, 비노출)                                                 |

---

## 7.5 초대 로직 구조 개선 (딥링크 유지)

> **deep-link 형식 초대 링크는 계속 지원한다.** 전송 형식을 바꾸지 않는다 — 문제는 형식이 아니라 프로세스가 한 곳에 몰려 있는 구조다.

web의 초대 수락은 `LoginPage`의 8단계 `handleAccept`(`LoginPage.tsx:147-281`)에 deep-link 파싱 + 디바이스 인증 + `loginWithInviteCode` + 토큰 빌드 + `cloudCore.save*` 직접 조작 + `setSelectedPlaceId` + 로컬 DB 저장 + 리로드가 전부 뒤섞여 있다. 단일 책임 레이어로 분해한다(딥링크 기능은 보존):

1. **입력 파싱** `parseInviteInput` — deep-link 쿼리파라(`code/_backend/_siteId/_cloudId/_cloudName/_wss`) 파싱을 한 모듈로 모으고 정규화 `InvitePayload`(`{ code, delegatorId, backend, cid, sid, wss, cloudName }`)를 반환. 중복 파싱 제거.
2. **수락 훅** `useInviteAccept` — `InvitePayload` → `loginWithInviteCode(code, delegatorId, backend)` → `repos.cloud.cacheWrite({ cloudType: 'invited', ... })` → 일반 `switchCloud` 진입. 직접 `cloudCore`/소켓 store 조작 없음(세션 변경은 web-core 서비스/훅 경유).
3. **`LoginPage`는 UI만** — loading/error/done 상태만, 오케스트레이션은 훅에 위임.
4. **재진입 분기 정리** — `restoreInvitedCloud`/`captureInvitedCloud`를 일반 `switchCloud`로 통일 검토.

구조 참조: `apps/testbed/src/app/pages/InvitePage.tsx`(수락 흐름 분리), `apps/testbed/src/app/features/invite/inviteCode.ts`(파서 분리 패턴). web 복잡도: `LoginPage.tsx:147-281`.

## 7.6 디렉터리 구조

훅을 한 곳에 몰아넣지 않는다. `shared/hooks`는 진짜 횡단 관심사만 두고, 도메인 훅은 해당 feature로 둔다.

```
apps/web/src/app/
  runtime/                 # 부트스트랩/연결: useSocketDelegate.ts 등 (app/hooks 덤프 금지)
  shared/hooks/            # 횡단 관심사만 (예: useBackHandler)
  features/<feature>/hooks/  # 도메인 훅 (channel/chat/place/invite ...)
```

순수 이동(동작 무변경) 커밋과 로직 변경 커밋을 분리한다.

## 8. 로그아웃 캐시 클리어 (잊지 말 것)

web-core 로그아웃 훅은 **세션 전이만** 수행하고 app-runtime/data·react-query 캐시는 비우지 않는다. 로그아웃 완료 후 앱이 직접 `DataManager.destroy()` + 쿼리 캐시 클리어를 해야 한다. 부트스트랩 리팩터링 중 이 처리를 잃지 않도록 한다.

근거: `libs/web-core/docs/session/session-scenarios.md §10`

---

## 9. 검증 체크리스트

- [ ] `grep -rn "@chatic/socket" apps/web/src` == 0
- [ ] `grep -rn "emit\|emitAuthenticated\|getSocketSend\|checkSocketHealth" apps/web/src` == 0
- [ ] 타입체크/빌드 통과
- [ ] 앱 진입 시 place/profile/channel 1회 refresh, observe로 화면 반영
- [ ] 사이트/클라우드 전환 확정(isVerified 재상승) 직후 동일 refresh 재발생, 목록이 새 cid/sid로 깔끔히 교체(이전 데이터 잔존/오염 없음)
- [ ] 주기 폴링(30s 리스트 발견 + per-item 실시간)이 전환 중에는 skip
- [ ] channel/profile 델타: since cursor 전진(최초 0 → 이후 증분), 전환 시 cursor 키 분리(교차 오염 없음)
- [ ] 채팅방: 초기 메시지 prime + 신규 push 반영(중복/누락 없음), 과거 페이징 동작
- [ ] 초대: deep-link 링크 진입→수락→invited 캐시→홈 진입 기존과 동일, `parseInviteInput` 케이스별 테스트 통과
- [ ] hooks 디렉터리 재배치 후 타입체크/빌드 통과, 동작 무변경
- [ ] 로그아웃 후 이전 클라우드 데이터가 캐시에 남지 않음

---

## 참조 파일

- `apps/testbed/src/app/app.tsx` — 부트스트랩
- `apps/testbed/src/app/hooks/useSocketDelegate.ts` — 소켓 delegate
- `apps/testbed/src/app/pages/ChatHomePage.tsx` — observe/sync/리프레시 타이밍 종합 레퍼런스
- `apps/testbed/src/app/pages/CreateChannelPage.tsx` — 채팅 sync/prime/페이징/전송
- `libs/app-runtime/docs/` · `libs/web-core/docs/` — 라이브러리 공식 가이드
