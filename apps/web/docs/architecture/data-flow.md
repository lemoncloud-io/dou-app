# 데이터 흐름 (observe / sync / refresh)

> 참조 구현: `apps/testbed/src/app/pages/{ChatHomePage,CreateChannelPage}.tsx`

앱은 데이터를 **repository observe로 읽고, sync로 갱신을 등록하고, 쓰기는 repository로** 한다. 수동 폴링·`isConnected`/`isVerified` 게이팅은 쓰지 않는다.

---

## 1. 부트스트랩 — `RuntimeConnectionHost`

`app.tsx`는 선언형 provider `RuntimeConnectionHost`로 런타임을 조립한다. 세션 init 게이트와 relay keep-alive, 그리고 `SocketBinder`/`SocketReauthBinder` 마운트를 Host가 내부에서 소유하므로, 앱이 init/keepalive/token-refresh를 수동 마운트할 필요가 없다.

```tsx
function AppInner() {
    const binding = useRuntimeBinding(); // 세션 관측 → cid/sid/uid + relay/cloud 소켓 슬롯

    return (
        <RuntimeConnectionHost binding={binding}>
            <BrowserRouter>
                <Routes />
            </BrowserRouter>
        </RuntimeConnectionHost>
    );
}
```

**Host props는 `{ binding, children }`뿐이다.** 소켓 인증 delegate는 Host 내부(`useSocketSessionDelegate`)가 소유하므로 앱이 주입하지 않는다.

**재인증은 자동이다.** 만료 refresh·재연결 재인증은 SDK `ClientSocketAuth`가, 물리 소켓을 유지한 채 신원만 바뀌는 경우(게스트→소셜 승격)는 `SocketReauthBinder`가 처리한다. 앱이 수동으로 `auth.update`를 보내면 안 된다(이중 발화).

근거: `apps/web/src/app/runtime/AppRuntime.tsx`, `apps/testbed/src/app/app.tsx`, [libs/app-runtime/docs/runtime/session-lifecycle.md](../../../../libs/app-runtime/docs/runtime/session-lifecycle.md)

---

## 2. 연결/세션 상태 읽기

소켓 상태도 세션/선택 상태도 출처는 `@chatic/app-runtime` 하나다(ADR-0070 세션 허브).

| 필요한 값                                            | 출처                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| `isVerified`, `isConnected`, `state`, `connectionId` | `useRuntimeSocketState()`                                    |
| `selectedSiteId`(=selectedPlaceId)                   | `useSessionSelection().selectedSiteId`                       |
| `selectedCloudId`(=cloudId)                          | `useSessionSelection().selectedCloudId` ('default' fallback) |
| `wssType`(relay/cloud)                               | `useGlobalSession().activeServer.kind`                       |

> `isVerified`는 "이 연결에 대해 `auth.update`가 ok된 시점"이다. 소켓 게이트웨이를 거치는 호출(목록 fetch 등)은 `isVerified` 이후에 실행해야 새 세션 기준으로 동작한다.

근거: [libs/app-runtime/docs/socket/README.md](../../../../libs/app-runtime/docs/socket/README.md), [libs/app-runtime/docs/public-surface.md](../../../../libs/app-runtime/docs/public-surface.md)

---

## 3. 데이터 읽기 — observe 구독 + sync 등록

- **observe**: UI는 `repos.<entity>.observeList(query, cb)` / `observeItem(id, cb)`만 구독한다. 캐시가 바뀌면(스스로의 refresh로든 sync push로든) 콜백이 다시 불린다.
    - **스코프 고정(scope pinning)**: observe의 재emit 라우팅은 `{cid, uid}` 스코프 키로 이뤄진다(캐시 스토리지 파티션과 동일; place·channel은 sid를 스코프 키에서 제외). 이 키는 기본적으로 `DataContextProvider`에서 계산된다. **원래의 함정은 사라졌다** — 예전에는 조상 `RuntimeDataBinder`가 effect에서 provider를 갱신했고, 그 effect가 자식 화면의 구독 effect보다 **뒤에** 돌아서 클라우드 전환 시 화면이 옛 cid 스코프로 구독을 걸었다(전환 확정 후의 write 재emit을 놓쳐 새로고침 전엔 안 보임). 지금은 `ActiveScope`가 매 read마다 `session/store`에서 파생하고 그 바인더는 삭제됐으므로 커밋 지연 자체가 없다. 그럼에도 홈 리스트 훅(`useHomePlaces`/`useHomeChannels`/`useActiveCloudChannels`)은 `observeList(query, cb, { cid, uid })`로 **React 세션이 아는 대상 클라우드의 스코프를 명시 전달**해 provider 커밋 지연과 무관하게 키를 고정한다. 근거: `libs/data/.../PlaceLocalDataSourceV2.test.ts`(reemit 라우팅).
- **sync 등록**: 화면 수명에 맞춰 sync 타깃을 등록하면 polling + push + 재연결 catch-up이 자동으로 돈다.
    - 단일 고정 id: `useChatSync(channelId)` / `useChannelSync(channelId)` / `usePlaceSync(placeId)` / `useProfileSync(profileId)` / `useJoinSync(channelId)`
    - 동적 목록: `getSyncManager().registerChannel(id)` / `registerPlace(id)`를 id 배열에 등록하고 dispose 반환값으로 정리

```tsx
// 동적 목록 등록 예
useEffect(() => {
    if (siteIds.length === 0) return;
    const sync = getSyncManager();
    const disposers = siteIds.map(id => sync.registerPlace(id));
    return () => disposers.forEach(d => d());
}, [siteIdsKey]);
```

**채팅방**: 초기 메시지 로딩 fetch는 sync 등록 계층(`useChatSync`)이 소유한다. 페이지는 `observeList({channelId, limit})`만 구독한다. **과거 페이징만** `repos.chat.refreshList({channelId, cursorNo, limit})`를 명시 호출하고 observe 윈도우(limit)를 넓힌다.

---

## 4. 데이터 쓰기 — 전부 repository 경유

직접 socket `send`/`emit`/`emitAuthenticated`는 금지. 모든 쓰기는 `useRuntimeRepositories()`의 repository 메서드로 한다.

| 작업                            | repository 메서드                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| 메시지 전송                     | `repos.chat.sendChat({ channelId, content })`                                                |
| 읽음 처리                       | `repos.join.readChat({ channelId, chatNo })`                                                 |
| 채널 생성/수정/초대/나가기/삭제 | `repos.channel.createChannel`/`updateChannel`/`inviteChannel`/`leaveChannel`/`deleteChannel` |
| Place(site) 생성/수정/삭제      | `repos.place.createPlace`/`updatePlace`/`deletePlace`                                        |
| 프로필 수정                     | `repos.user.updateProfile(...)` 또는 `repos.profile.setMyProfile(...)`                       |

> `auth:update` 송신은 데이터 쓰기가 아니라 재인증이며 `SocketAuthBinder`가 자동 처리한다 — 앱에서 보내지 않는다.

근거: `libs/data/src/data/repositories-v2/*`

---

## 5. 리프레시 타이밍 ⭐

sync 런타임은 소켓 교체(재연결/재인증) 시에만 등록 타깃을 자동 replay하고, `sid`/`cid` 컨텍스트 변경만으로는 자동 재fetch하지 않는다. 따라서 (a)·(b)는 **명시적 `refresh*` 호출이 필수**다.

리프레시 묶음(`refreshActiveLists`) — channel/profile은 **syncMeta 델타 동기화**(§6)를 쓴다.

```ts
const refreshActiveLists = useCallback(async () => {
    void repos.place.refreshList().catch(() => {}); // place는 델타 게이트웨이 없음 → full
    if (!activeSiteId) return;
    await syncChannelsDelta(cid); // channel 델타
    await syncProfilesDelta(cid, activeSiteId); // profile 델타 (sid 스코프)
}, [repos, cid, activeSiteId]);
```

### (a) 앱 진입 + (b) 클라우드 전환 확정 — `isVerified` 상승 엣지

둘 다 **`useRuntimeSocketState().isVerified`의 false→true 상승 엣지** 하나로 포착한다. 클라우드 전환은 소켓을 재부팅하므로 `isVerified`가 하강 후 재상승한다 = "전환 확정 완료". 상승 엣지에서만 부르므로, 전환 낙관 구간(아직 옛 세션이 `verified=true`)에는 fetch하지 않아 이전 데이터가 새 `sid`/`cid`로 오염되지 않는다.

**사이트 전환은 이 엣지에 안 걸린다.** 같은 소켓에서 SDK `auth.switch`로 site만 옮기고 `authenticated`를 유지하므로 하강이 없다 — 그래서 sid 변경을 보는 트리거가 따로 있다(아래 (e)). 클라우드 전환은 상승 엣지가 sid 워터마크(`prevSiteRef`)를 먼저 올려 두어 (e)가 같은 fetch를 두 번 하지 않는다.

상승 엣지에서 도는 것은 `refreshActiveLists`(델타)와 `loadSelfChannel`(`channel.get-self`, 릴레이 서버 한정)뿐이다. **채널 풀 스냅샷(`channel.mine`)은 돌지 않는다** — 목록 수렴은 클라우드 전역 델타인 `channel.syncChannels`가 담당한다(§6).

```ts
const prevVerifiedRef = useRef(false);
useEffect(() => {
    const becameVerified = !prevVerifiedRef.current && isVerified;
    prevVerifiedRef.current = isVerified;
    if (becameVerified) {
        prevSiteRef.current = activeSiteId; // (d)가 중복 fetch하지 않도록 워터마크 선반영
        void refreshActiveLists();
        void loadSelfChannel();
    }
}, [isVerified, activeSiteId, refreshActiveLists, loadSelfChannel]);
```

### (c) 주기 폴링 — 두 계층

1. **리스트 발견 폴링** — `setInterval`로 `refreshActiveLists` 재호출(추가/삭제된 목록 항목 재발견). **전환 진행 중(`isSwitching`/`isSiteSwitching`)에는 skip**(낙관 구간 stale fetch 방지).
2. **per-item 실시간 폴링** — 보이는 항목별 `sync.registerChannel(id)`/`registerPlace(id)` 등록(기본 5s, idle backoff 60s). `lastChat$`·메타 등 항목 내부 변화를 실시간 갱신.

> **mis-tag 주의**: 전환 직후 observe 콜백은 비동기라 잠시 이전 사이트 채널을 들고 있을 수 있다. 반드시 `channel.sid === activeSiteId`로 필터하고 **활성 사이트 채널만 sync 등록**한다 — 아니면 sync push가 이전 채널을 새 `sid`로 mis-tag해 목록이 오염된다.

### (d) 앱 포그라운드 복귀 — `useAppForeground`

WebView가 백그라운드에서 suspend되면 폴링 타이머가 얼고 소켓 push를 놓칠 수 있다. 소켓이 살아남아 재연결(=상승 엣지)이 없으면 그 갭을 메울 경로가 없으므로, **포그라운드 복귀를 명시적 리프레시 트리거로 쓴다.**

- **감지**: `apps/web/src/app/bridge/useAppVisibility` — 네이티브 `OnBackgroundStatusChanged` + 웹 폴백 `visibilitychange`를 합치고 방향별 ~1초 dedup한 단일 가시성 신호(`isForeground: boolean`). `useAppForeground`는 이것의 포그라운드 필터 래퍼다. (GlobalBridgeListener의 resume 오버레이 dismiss도 같은 훅을 쓰고, `useDeviceSync`의 presence status 통지(green/yellow → `device.sync`)는 양방향 신호를 직접 구독한다.)
- **목록**: `useBackgroundSync` 트리거 3 — verified·비전환 중이면 `refreshActiveLists()` 실행.
- **채팅 피드**: `useForegroundChatRefresh(channelId)` — chat 플랜은 폴링이 없어(라이브 push + 재연결 catch-up뿐) 놓친 push는 자동 복구되지 않는다. 이 훅은 `usePrimeChat`(cold일 때만 fetch)의 **의도적 보완**으로, **warm 캐시일 때만** 베이스라인 재정렬 후 최신 페이지를 refetch한다 — 진입 시(푸시 탭: 방 마운트 전에 포그라운드 신호가 지나가는 케이스) + 복귀 시. 두 정책은 거울상이므로 한쪽을 바꾸면 반드시 같이 바꾼다.

### (e) 사이트 전환 — 활성 `sid` 변경

사이트 전환은 (a)/(b)의 상승 엣지를 만들지 않으므로(같은 소켓, `authenticated` 유지) 별도 트리거가 필요하다. 이게 없으면 **전환으로만 도달한 사이트는 한 번도 fetch되지 않아 채널 목록이 빈 채로 남는다.**

```ts
useEffect(() => {
    if (!isVerified || isSwitching || !activeSiteId) return;
    if (prevSiteRef.current === activeSiteId) return; // 클라우드 전환은 (a)/(b)가 이미 올려놨다
    prevSiteRef.current = activeSiteId;
    void refreshActiveLists();
    void loadSelfChannel();
}, [activeSiteId, isVerified, isSwitching, refreshActiveLists, loadSelfChannel]);
```

전환이 끝난 뒤(`verified` + 비전환 중)에만 돌므로 낙관 구간의 stale fetch를 피한다. `prevSiteRef`는 (a)/(b)와 공유한다.

---

## 6. channel / profile 델타 동기화 (syncMeta)

channel·profile은 full fetch 대신 **syncMeta cursor 기반 델타 동기화**를 쓴다. cursor를 `syncMeta` 레포에 저장해 매번 증분만 받는다.

```ts
// channel: 클라우드 전역 델타
const kind = `channel-sync:${cid}`;
const since = await repos.syncMeta.getSyncedAt(kind);
const { syncedAt } = await repos.channel.syncChannels(since);
await repos.syncMeta.setSyncedAt(kind, syncedAt);

// profile: sid 스코프 델타
const pKind = `profile-sync:${cid}:${sid}`;
const pSince = await repos.syncMeta.getSyncedAt(pKind);
const { syncedAt: pAt } = await repos.profile.syncProfiles(pSince);
await repos.syncMeta.setSyncedAt(pKind, pAt);
```

- cursor kind 키는 스코프를 반영: channel은 `${cid}`, profile은 `${cid}:${sid}`. 전환 시 키가 새 cid/sid로 바뀌어 교차 오염을 막는다.
- `syncChannels`는 클라우드 전역 델타(캐시는 cloud-wide), sid 스코프 UI는 `observeList({sid})`가 필터한다.
- place는 델타 게이트웨이가 없어 `place.refreshList`(full)을 유지한다.

### cursor TTL — 1일 지나면 전량 재동기화

cursor는 **TTL 1일**을 가진다(`meta` 캐시 TTL). sync 성공마다 `setSyncedAt`으로 재저장되어 TTL이 갱신되므로, 실사용 중에는 만료되지 않는다. **앱을 1일 이상 켜지 않아 cursor가 만료되면 `getSyncedAt`이 0을 반환**하고, 다음 sync가 `since=0` 전량 재동기화로 동작한다 — 오래 방치된 cursor로 서버 델타 히스토리 범위를 넘겨 removal을 놓치는 것을 막는 안전장치다.

만료 판정은 저장된 `expiresAt`이 아니라 **읽기 시점에** `__cacheMeta.lastSyncedAt + TTL`로 계산한다. 과거 "never expire" 정책으로 저장된 행에도 현재 TTL이 소급 적용된다.

근거: `libs/data/src/data/local/data-sources-v2/SyncMetaLocalDataSourceV2.ts`, `libs/data/src/data/local/storages/utils.ts`

근거: `libs/data/src/data/repositories-v2/{SyncMetaRepositoryV2,ChannelRepositoryV2,ProfileRepositoryV2}.ts`

---

## 7. 로그아웃 캐시 클리어

`useSessionLogout`은 **세션 전이만** 수행하고 react-query 캐시는 비우지 않는다. 로그아웃 완료 후 앱이 직접 쿼리 캐시를 클리어해야 이전 클라우드 데이터가 화면에 남지 않는다.

`DataManager.destroy()`는 더 이상 부를 필요가 없다 — no-op이다. 데이터 스코프는 `ActiveScope`가 세션 스토어에서 read 시점에 파생하므로, 세션이 비면 다음 read부터 다른 파티션을 본다.

근거: [libs/app-runtime/docs/session/architecture.md](../../../../libs/app-runtime/docs/session/architecture.md)
