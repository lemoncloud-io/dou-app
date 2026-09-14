# ADR-0085: sid는 값이지 캐시 스코프 축이 아니다

> 상태: Accepted · 결정일: 2026-09-14 · 관련: [ADR-0051](./0051-cache-storage-routing-simplification.md) (저장 스코프 정책의 소유자), [ADR-0070](./0070-app-runtime-session-hub.md) (선택 컨텍스트 파생), [ADR-0081](./0081-libs-data-doc-canon-and-layer-flattening.md) (같은 lib의 선행 정리)

## 맥락 (Context)

`DataContext`는 `cid`·`sid`·`uid` 세 값을 갖는다. 이 중 `sid`만 두 가지 일을 동시에 한다.

| 역할                  | 쓰이는 곳                                                                      | 상태        |
| --------------------- | ------------------------------------------------------------------------------ | ----------- |
| **값** (요청·필터·id) | 프로필 id `${sid}@${uid}`, 서버 페이로드의 `siteId`, 채널의 사이트별 목록 필터 | 살아 있다   |
| **축** (파티션 차원)  | 옵저버 스코프 해시 `getScopeKey`                                               | 근거가 없다 |

아래는 두 번째 역할이 왜 근거를 잃었는지에 대한 기록이다.

### 저장소는 sid로 파티션하지 않는다

물리 파티션의 정의는 `AdapterScope`이고, 필드가 둘뿐이다.

```ts
// libs/data/src/local/ports/policy.ts:36
export interface AdapterScope {
    cid: string;
    uid: string;
}
```

저장 키도 같은 말을 한다 — `"channel:cid:uid:id"` (`libs/data/src/local/ports/cacheStorage.ts:55`).
`resolveScopedContext`(`policy.ts:87`)는 `invitecloud`를 global로 고정하는 것 말고는
`resolveBaseScope`를 그대로 돌려주고, 거기에도 sid는 없다.

**sid는 저장소에 도달한 적이 없다.** 스코프 축으로서의 sid는 처음부터 옵저버 레지스트리에만 있었다.

### 그런데 옵저버 스코프 키는 sid를 넣는다

```ts
// libs/data/src/local/data-sources/types.ts:149
protected getScopeKey(contextOverride?: LocalDataSourceContextOverride): string {
    const context = this.getContext(contextOverride);
    return stableHash({
        cid: context.cid || 'default',
        sid: context.sid || '',
        uid: context.uid || 'default',
    });
}
```

결과는 하나다. **한 물리 파티션이 여러 옵저버 스코프로 쪼개진다.** sid=A로 쓴 값이 sid=B로 구독한
옵저버를 깨우지 않는다. 둘이 같은 행을 읽는데도 그렇다. 구독과 재발행이 같은 함수를 지나므로
어긋나지는 않지만, 어긋나지 않게 같이 틀린다.

### 9개 중 3개는 이미 이 축을 지웠다

데이터소스는 9개다. 그중 셋이 override로 스코프를 저장 파티션에 맞췄고, **셋 다 주석에 같은 사고를 적어놨다.**

| 데이터소스                  | override   | 주석이 기록한 사고                                                                                                                              |
| --------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `PlaceLocalDataSource:57`   | `sid: ''`  | 클라우드 전환 때 sid가 비워졌다 다시 선택되는 타임라인이 달라서, 레일이 비어 보이는데 캐시엔 행이 있었다 (`placeCache>0` · `usePlaces`는 빈 값) |
| `ChannelLocalDataSource:35` | `sid: ''`  | 같은 실패. 사이트별 격리는 리스트 키 `\|sid:<sid>\|`가 맡는다                                                                                   |
| `CloudLocalDataSource:42`   | `'global'` | 저장이 global 파티션 하나인데 스코프만 활성 cid/sid/uid로 갈렸다                                                                                |

셋 다 결론이 같다 — **옵저버 스코프를 저장 파티션에 맞춘다.**

### 남은 6개는 같은 지뢰를 그대로 안고 있다

| 데이터소스 | sid를 어떻게 쓰나                                                     | 스코프 키의 sid가 하는 일 |
| ---------- | --------------------------------------------------------------------- | ------------------------- |
| `Profile`  | 리스트 키에 이미 해석된 sid가 들어간다 (`ProfileLocalDataSource:244`) | 없다. 분열 위험만 남는다  |
| `Chat`     | 쓰기 가드로만 읽는다 (`:193`, `:225`)                                 | 없다                      |
| `Join`     | 쓰기 가드로만 읽는다 (`:78`, `:114`)                                  | 없다                      |
| `Invite`   | 읽지 않는다                                                           | 없다                      |
| `User`     | 읽지 않는다                                                           | 없다                      |
| `SyncMeta` | 읽지 않는다                                                           | 없다                      |

Profile이 제일 선명하다. 리스트 키가 이미 sid를 갖고 있으니 스코프 키의 sid는 격리에 보태는 게
없다. 남은 효과는 분열 하나뿐이다.

### Chat·Join의 가드는 소비자가 없다

둘은 쓰기 때 `context.sid`가 없으면 throw한다. 그런데 **그 sid를 행에 저장하지도, 키에 쓰지도
않는다.** 받아서 존재 여부만 보고 버린다.

이 가드는 `9f4706886`(2026-06-28, V1 데이터소스 제거)에 딸려 들어왔다. 그 시점에도 sid가 저장
키에 들어간 흔적은 없다. 의도된 결정이 아니라 승계된 모양이다.

Profile의 sid 요구는 성격이 다르다. 프로필 id가 `${sid}@${uid}`라서 **sid 없이는 쓸 키를 만들 수
없다.** 같은 `assertRequiredString`처럼 보이지만 하나는 계약이고 나머지는 잔재다.

### 이미 어긋난 호출부가 하나 있다

`JoinRepository`는 쓰기를 **항상 ambient 컨텍스트로** 한다 (`cacheWrite` → `getRepositoryContext()`,
`JoinRepository.ts:81`). 반면 읽기는 override를 받는다 (`observeList`, `:47`).

`apps/web`의 `useMyJoins`는 그 override에 **채널별 sid**를 넣는다.

```ts
// apps/web/src/app/hooks/useMyJoins.ts:101
{ cid: selectedCloudId ?? 'default', sid: channelById.get(id)?.sid, uid }
```

선택된 사이트와 그 채널의 sid가 다르면 두 해시가 달라진다. 쓰기는 선택된 sid로, 구독은 채널의
sid로 등록된다. 구조적으로 재발행이 닿지 않는다.

같은 리포의 다른 훅 둘은 이미 반대로 간다 — `useActiveCloudChannels:73`과
`useAwaitInviteChannel:102`는 override를 `{ cid, uid }`로만 준다. 주석에 "SCOPE PINNING"이라고
적어놨고 sid는 처음부터 넣지 않는다. **apps/web은 이미 sid를 축으로 쓰지 않고 있다.**
`useMyJoins`가 마지막 예외다.

### ambient sid는 쓰기에서 이미 사고를 냈다

`switchSite`는 sid를 **먼저 적용하고 토큰을 나중에 교환한다** — `applySelectedSite(siteId)` 후 교환,
실패하면 되돌린다 (`libs/app-runtime/src/socket/auth/switchSite.ts:41`·`:57`). 그 창 동안 ambient
sid와 서버가 실제로 쓰는 사이트가 어긋난다.

`apps/web`은 이미 그 창을 우회하고 있다.

```ts
// apps/web/src/app/hooks/useSetMyPlaceProfile.ts:27
// Pinned write. `setMyProfile` reads the sid off the ambient context, which a site
// switch only PRE-APPLIES optimistically before the token commits (app-runtime
// `switchSite`) — a write racing that switch lands on the previous place. The
// place-create flow knows exactly which place the profile belongs to, so it says so.
```

장소 생성 흐름은 어느 장소의 프로필인지 알기 때문에 ambient sid를 믿지 않고 `siteId`를 직접 준다.
**ambient sid를 못 믿는다는 판단이 이미 코드에 있다.** 다만 그 판단이 호출부 한 곳에만 있다.

### 읽기 쪽 ambient 폴백은 소비자가 없다

세어봤다. 채널·프로필 목록을 여는 앱 호출부는 **전부 sid를 명시로 넘긴다** — 실제 sid이거나
"전체"를 뜻하는 `''`이다 (`useHomeChannels`, `useActiveCloudChannels`, `useAwaitInviteChannel`,
`useChannelProfiles`, `useSenderProfiles`, desktop-web의 `useChannels`·`useChannelChatFeeds`·
`useDesktopNotifications`·`useChatOutbox`). `query.sid ?? context.sid` 폴백을 타는 곳은 없다.

앱은 이미 sid를 손에 쥐고 있다 — `selectedSiteId`를 읽는 자리가 66곳이다.

## 결정 (Decision)

### 1. `DataContext`에서 sid를 제거한다

결정 2·3을 적용하고 나면 ambient sid를 읽는 자리는 18곳이 남는다. 세 덩어리이고, 처리도 셋으로 갈린다.

| 덩어리                    | 자리                                                                                                                              | 처리                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **읽기 기본값**           | `ChannelRepository:191`, `ChannelLocalDataSource:55`·`:208`, `ProfileLocalDataSource:37`·`:244`                                   | 삭제. 타는 호출부가 없다 |
| **쓰기 태그·매핑 폴백**   | `mappers:93`·`:215`, `ChannelLocalDataSource:111`·`:153`, `ProfileLocalDataSource:190`·`:219`, `ProfileSocketDataSource:54`·`:74` | 삭제. 사고의 출처다      |
| **"내 현재 사이트" 계약** | `ProfileRepository:106`·`:150`·`:158`                                                                                             | 명시 인자로 올린다       |

세 번째만 시그니처가 바뀐다.

- `setMyProfile(body)` → `setMyProfile(body, siteId)`
- `syncProfiles(since)` → `syncProfiles(since, siteId)`
- `setProfile`의 `input.siteId || context.sid` 폴백은 사라지고 `input.siteId`가 필수가 된다

호출부는 이미 sid를 쥐고 있다. `useSetMyPlaceProfile`은 두 갈래(핀 고정 / ambient)를 하나로 합칠
수 있고, 그 갈래를 만든 주석도 같이 사라진다.

배관도 같이 사라진다 — `getNormalizedContext`의 sid 정규화(`repositories/types.ts:79`),
`BaseLocalDataSource.getSid`(`local/data-sources/types.ts:145`), 그리고 **생산자인
`deriveSelectedContext`의 `sid: activeServer.siteId`**(`libs/app-runtime/src/session/scope/selectedContext.ts:32`).
마지막 것이 이 트랙에서 `libs/data` 밖을 건드리는 유일한 자리다.

`DataContext`에 남는 것은 `cid`·`uid`·`socketCid`다. 스코프(`AdapterScope` = `{cid, uid}`)와
그것을 지키는 값 하나. **스코프 키에 sid를 다시 넣는 실수가 타입 수준에서 불가능해진다.**

### 2. base `getScopeKey`에서 sid를 뺀다

스코프는 `{cid, uid}`다. 저장 파티션의 정의(`AdapterScope`)와 같은 모양이 된다.

override 2개(`Channel`·`Place`)는 base와 같아지므로 **삭제한다**. `Cloud`의 `'global'` override는
남는다 — 그건 sid가 아니라 cid/uid를 고정하는 것이고, `resolveScopedContext`의 `invitecloud`
분기와 짝이다.

각 override 주석이 기록한 사고는 지워지지 않는다. base `getScopeKey` 주석으로 옮긴다.

### 3. Chat·Join의 sid 쓰기 가드를 삭제한다

`ChatLocalDataSource`의 두 곳, `JoinLocalDataSource`의 두 곳. 소비자가 없는 문지기다.

**Profile의 sid 요구는 존치한다.** id의 일부이므로 계약이다.

세션이 덜 준비된 상태의 쓰기를 막는 그물은 따로 있다. uid가 없으면 `resolveBaseScope`가 `null`을
돌려주고, `BaseDbAdapter.getScope`가 경고 한 줄을 남기고 캐시 접근을 건너뛴다
(`libs/db/src/base/BaseDbAdapter.ts:32`). sid 가드를 지워도 그 그물은 그대로다.

### 4. 가드 때문에 sid를 넘기던 호출부를 정리한다

`useMyJoins`의 override에서 sid를 뺀다. `{ cid, uid }`가 되고, 같은 파일의 다른 훅 둘과 모양이
같아진다.

이 정리를 같이 하는 이유는 하나다. 가드가 남으면 호출부의 sid 전달도 남고, **"값 sid / 축 sid"의
구분이 코드에서 다시 흐려진다.** 이 ADR이 세우려는 경계가 그 지점에서 무너진다.

### 범위 밖

- **쿼리 인자의 sid는 전부 그대로다.** `channel.observeList({ sid })`, `profile.cacheReadList({ sid })`
  같은 것들. 그게 값으로서의 sid가 사는 자리다. `apps/desktop-web`의 sid 사용은 전부 이쪽이라
  이 결정의 영향을 받지 않는다.
- `V2` 접미사 제거(ADR-0081 결정 4)와 섞지 않는다.
- 저장소를 sid로 파티션하는 방향은 검토하지 않았다.
- `DomainChannel.sid`·`DomainProfile.sid` 같은 **행 위의 sid**는 그대로다. 사라지는 것은 ambient 컨텍스트의 sid뿐이다.

## 잃는 것 (의도된 손실)

- **sid 단위 옵저버 격리.** 지금은 sid가 다르면 옵저버 그룹이 갈린다. 이후에는 같은 `{cid, uid}`의
  그룹이 하나로 합쳐진다. 저장소 왕복은 오히려 줄어든다 — 같은 물리 행을 두 그룹이 따로 읽던 것이
  한 번이 되고, 지금 놓치던 재발행이 닿는다.
  **대가는 불변식 하나를 사람이 지켜야 한다는 것이다.** 읽기가 ambient sid에 의존하는데 그 sid를
  리스트 키에 넣지 않은 데이터소스가 생기면, 합쳐진 그룹이 서로 다른 두 읽기를 하나의 틀린 답으로
  뭉갠다. 지금은 그런 곳이 없다 — sid로 필터하는 `Profile`·`Channel`은 해석된 sid를 리스트 키에
  넣고(`ProfileLocalDataSource:244`, `ChannelLocalDataSource:208`), 나머지는 sid를 아예 읽지
  않는다. 지금까지는 스코프 키의 sid가 그 실수를 **우연히** 덮어주고 있었다. 이후로는 덮어주지
  않는다. 규칙 자체는 새로 생기는 게 아니다 — `ChatLocalDataSource:306`이 이미 같은 말을 적어놨다:
  "저장소에 닿는 모든 필드는 키에 있어야 한다".
- **매핑의 마지막 폴백이 사라진다.** 서버 응답에 `sid`도 `$.sid`도 `siteId`도 없을 때, 지금은
  ambient sid가 마지막으로 그 행에 사이트를 붙여준다 (`mappers:93`·`:215`). 이후에는 `''`가 되고,
  `ChannelLocalDataSource`의 쓰기는 sid를 못 풀면 throw한다. **조용한 오태깅이 시끄러운 실패로
  바뀐다.** 방향은 맞지만 무해하지는 않다 — 구현 전에 실제 페이로드로 확인할 것: `channel.sync`는
  `$.sid`를 보내고(`ChannelRepository:253`이 그걸 전제로 거른다) `profile.sync`는 응답에 sid가
  없어서 `ProfileSocketDataSource:54`가 컨텍스트로 채운다. **후자가 이 결정의 유일한 실질 위험이다.**
  `profile.sync` 호출부가 sid를 넘기게 되면(결정 1) 같은 값이 그 자리로 전달되므로 메워지지만,
  그 경로가 실제로 이어지는지는 구현에서 확인해야 한다.
- **미래에 sid로 물리 파티션을 나누기로 하면 이 결정을 되돌려야 한다.** 대가는 작다 — 그때는
  `AdapterScope`와 저장 키부터 바꿔야 하고, 스코프 키 복원은 그 작업의 한 줄이다.
- **Chat·Join 쓰기에서 "sid가 없다"는 신호가 사라진다.** 그 신호가 무엇을 잡아준 적은 없지만,
  세션 초기화 순서가 깨졌을 때 시끄럽게 터져주던 자리이긴 하다.

## 검토한 대안

- **`DataContext.sid`를 남기고 의미만 주석으로 재정의한다.** ("값이지 축이 아니다"를 문서와 주석에
  적고 코드는 그대로 둔다.) 파급이 0이다. **기각** — 초안의 결정이었고 한 번 뒤집었다. 기각 이유는
  둘이다. 첫째, 파급이 크다고 봤던 근거가 측정에서 무너졌다 — 읽기 폴백은 타는 호출부가 없고,
  시그니처가 바뀌는 것은 `ProfileRepository`의 메서드 셋뿐이다. 둘째, 남겨둔 ambient sid는
  중립적인 잔재가 아니라 **쓰기 경합의 원인**이고, 그건 주석으로 못 막는다 —
  `useSetMyPlaceProfile`이 이미 우회 코드로 증명했다.
- **override를 남기고 base만 고친다.** `Channel`·`Place`의 override를 명시적 no-op으로 유지해
  "여기는 sid를 안 쓴다"를 눈에 보이게 둔다. **기각** — base와 같은 코드가 두 벌 남고, 다음에
  base가 바뀌면 두 곳이 조용히 갈라진다. 주석으로 남길 사실을 코드로 남길 이유가 없다.
- **스코프 키만 고치고 Chat·Join 가드는 둔다.** 변경이 작다. **기각** — 4번에 적은 이유 그대로다.

## 알려진 부수 효과

- **테스트 반경이 작다.** `libs/data`의 데이터소스 테스트는 전부 컨텍스트의 sid를 단일 값으로
  고정해서 쓴다. sid가 다른 두 옵저버의 격리를 단언하는 테스트는 없다. 즉 이 변경을 막아설
  기존 테스트가 없고, **동시에 이 변경을 지켜줄 기존 테스트도 없다.** 구현 단계에서
  "같은 `{cid,uid}`의 서로 다른 sid 옵저버가 한 쓰기에 함께 깨어난다"를 새 테스트로 고정한다.
- **`useMyJoins`의 어긋남은 이 ADR로 고쳐지지만, 실제 증상으로 관측된 적은 없다.** 구조에서
  읽은 결론이다. 활성 사이트와 다른 사이트의 채널이 홈에 함께 뜨는 조건에서만 드러난다.
- **파일 경로는 `V2` 접미사 제거 이후 기준이다.** 이 문서를 쓰는 시점에 워크트리에
  `repositories-v2` → `repositories`, `data-sources-v2` → `data-sources` 리네임이 미커밋 상태로
  올라와 있다 (ADR-0081 결정 4가 보류로 내려둔 그 작업). 그 변경이 되돌려지면 이 문서의 경로에
  `-v2`를 다시 붙여 읽어야 한다.
