# ADR-0072: 데스크탑 채널 멤버 추가는 공유 채널에서 고르는 직접 추가 하나로, 읽음 커서는 전역 유저 레코드에서 뺀다

> 상태: Accepted · 결정일: 2026-08-28
> 관련: [ADR-0022](./0022-channel-invite-page-web-ui-kit.md) (apps/web 초대 — 연락처 배치초대·초대링크 페이지. **이 ADR과 다른 물건**) · [ADR-0015](./0015-channel-settings-ui-refresh.md) (채널 설정·kick을 `leaveChannel`로) · [ADR-0048](./0048-unread-count-derivation-contract.md) (unread 파생 계약 — join 캐시가 읽음 커서의 집이라는 전제를 공유)

## 맥락 (Context)

### 요구

데스크탑에서 **이미 다른 채널에 함께 있는 사람**을 이 채널에 넣고 싶다. 출발 가정은
"userId로 초대링크를 만든다"였다.

### 이미 있는 것

| 영역                 | 현존 자산                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 직접 추가 API        | `ChannelRepositoryV2.inviteChannel` → `ChannelRemoteDataSource.inviteChannel` → `gateway.invite`. `ChatInviteInput = { channelId, userIds[] }`. 엔진까지 왕복이 이미 돈다 |
| 앱 래퍼              | [`useChannelMutations.ts`](../../apps/desktop-web/src/app/shared/hooks/useChannelMutations.ts)의 `inviteChannel`, apps/web도 동형                                         |
| 멤버 목록            | [`useChannelMembers.ts`](../../apps/desktop-web/src/app/features/channels/hooks/useChannelMembers.ts) — 유저 캐시를 `channelIds`로 필터해 관찰                            |
| 전화번호 릴레이 초대 | `InviteDialog` + `useCreateInvite` → `user.invite-batch`. 계정 없는 사람에게 보낼 링크를 만든다                                                                           |

### 공백

1. **직접 추가 API를 부르는 UI가 하나도 없었다.** repo 전체에서 `inviteChannel(`을 부르는
   곳은 위 래퍼 두 파일뿐이었다.
2. **유일한 초대 버튼이 `import.meta.env.DEV` 뒤에 있었다.** 프로덕션 빌드에는 채널에
   사람을 넣는 경로가 아예 없었다.
3. **`inviteChannel`만 낙관적 쓰기가 없었다.** 형제 mutation(`createChannel`·
   `updateChannel`·`leaveChannel`)은 전부 로컬 선반영 + 롤백인데 이것만 서버 응답만 썼다.
   프로젝트 mutation 규칙(백엔드가 결과적 일관성이라 쓰기 직후 읽기는 stale)에 어긋난다.

### 제약

- **`channel.invite`는 링크가 아니라 즉시 추가다.** 등록된 유저를 바로 멤버로 넣고 수락
  단계가 없다. 링크를 만들려면 서버 신규 경로가 필요하다.
- **클라우드 전역 유저 디렉터리가 없다.** `channel.list-user`는 채널 단위 스코프다.
- **`channel.invite`의 owner-only 여부가 서버 코드에서 확인되지 않았다** (미검증).

## 결정 (Decision)

### 1. 초대가 아니라 추가 — 후보는 내가 속한 채널들의 멤버 합집합

`AddMembersDialog`가 검색 + 다중선택으로 사람을 고르고 `channel.invite`로 즉시 넣는다.
링크도 수락 단계도 없다. 진입점은 채널 설정 패널과 채널 헤더 메뉴 두 곳.

후보 풀은 전역 디렉터리가 없으므로 클라이언트에서 만든다
([`useInviteCandidates.ts`](../../apps/desktop-web/src/app/features/channels/hooks/useInviteCandidates.ts)) —
내 채널들의 로스터를 각각 읽어 합집합하고, 타깃 채널의 멤버와 나를 뺀다.

- **제외 소스가 둘이다**: 로스터 읽기 결과 **그리고** 채널 레코드의 `memberIds`. 로스터
  fetch가 실패해도 이미 채널에 있는 사람이 후보로 뜨지 않는다.
- **소켓이 unverified면 캐시 풀을 낸다.** 슬립/웨이크 후 소켓이 무한정 unverified로 남는
  경로가 있어([`useChannels.ts`](../../apps/desktop-web/src/app/shared/hooks/useChannels.ts))
  기다리면 스피너가 영구 고정된다. 네트워크 패스는 false→true 엣지에서 다시 돈다.
- 다이얼로그가 열려 있을 때만 마운트한다 — 채널 수만큼 요청이 나가기 때문이다.

### 2. `inviteChannel`을 낙관적 쓰기로

초대한 id를 라운드트립 **전에** `memberIds`에 넣고, 실패하면 초대 전 채널 레코드를
복원한다(`updateChannel`과 같은 모양). 서버 응답이 멤버 목록을 생략해도 초대한 id가
유실되지 않게 union한다 — `leaveChannel`이 kick에서 쓰는 것과 같은 방어다.

멤버 목록은 **유저 캐시**(`channelIds`)를 읽는데 초대 응답은 **채널 캐시**만 건드리므로,
성공 후 고른 레코드를 유저 캐시에 직접 쓴다
([`useAddMembers.ts`](../../apps/desktop-web/src/app/features/channels/hooks/useAddMembers.ts)).
리페치가 아니다. 이 캐시 쓰기가 실패해도 **이미 성공한 초대를 실패로 보고하지 않는다**.

### 3. 채널별 읽음 커서를 전역 유저 레코드에서 뺀다

`toDomainUser`가 roster 응답을 그대로 펼쳐 `$join` — _그 응답이 다룬 채널의_ 읽음 커서 —
을 유저 레코드에 실었다. 유저 레코드는 user id 당 한 행이고 `channelIds`가 채널을
가로질러 union되는 **전역 레코드**라, 마지막에 매핑된 채널이 그 필드를 소유했다.

아무도 그 필드를 읽지 않는다 — 모든 소비자는 `channel.$join`을 읽고, 채널별 커서의 집은
`channelId@userId`로 키잉된 **join 캐시**다. 그런데도 그냥 뗄 수 없었다:
`UserRepositoryV2.refreshList`가 **이미 매핑된 유저**에서 join을 수확하고 있었기 때문이다.
mapper에서만 떼면 join 캐시 hydration이 통째로 죽는다.

수확 지점을 raw view로 옮긴다 — `fetchUsers`가 `{ users, joins }`를 반환하고
(`syncChannelUsers`가 이미 쓰던 모양) `refreshList`는 받은 것을 쓴다. 그러고 나서
`toDomainUser`가 `$join`을 **읽기만** 하고(`channelIds` 파생) 결과에는 싣지 않는다.

그 결과 **후보 훅의 "타깃 채널 로스터를 마지막에 fetch"라는 순서 제어가 통째로
불필요해졌다.** 그 순서 제어는 평면 캐시 위의 밴드에이드였다.

### 4. 전화번호 릴레이 초대는 플래그 뒤에 남기지 않고 삭제

계정 없는 사람에게 보낼 링크를 만드는 흐름은 "팀원을 이 채널에 넣기"와 다른 제품이고,
프로덕션에 나간 적이 없다. `InviteDialog` · `useCreateInvite` · `buildInviteLink` ·
`'invite'` 다이얼로그 종류 · dev 게이트 버튼 두 개 · i18n 키 9개를 전부 지웠다.
다른 호출자가 없었다. **데스크탑에서 계정 없는 사람에게 도달하는 경로가 사라졌다.**
apps/web은 자체 초대 흐름(ADR-0022)을 그대로 유지한다.

### 5. owner 게이팅은 서버에 맡긴다

`channel.invite`가 owner-only인지 확인하지 못했으므로 버튼을 게이트하지 않고, 서버 거부를
토스트로 노출한다. 추측한 게이트보다 QA에서 읽히는 실패가 낫다.

## 대안 (Alternatives)

- **초대링크를 userId로 생성** — 서버에 해당 경로가 없다. 신규 스펙 없이는 불가.
- **수동 userId 입력** — 프로필 팝오버가 id를 복사해 주므로 더 작은 구현이었다. 공유
  채널에서 고르는 쪽을 택했고, 검색창이 id도 매칭하므로 붙여넣기 자체는 여전히 동작한다.
- **후보 집계를 엔진(`libs/data`)으로** — apps/web이 재사용할 수 있게. 대응 서버
  엔드포인트가 없어 **갈라질 원본 자체가 없다.** 두 번째 클라이언트가 피커를 요구하는
  날 옮긴다.
- **`inviteChannel`이 유저 캐시 쓰기까지 소유** — 올바른 깊이지만 리포지토리에
  `IUserLocalDataSourceV2` 주입이 필요해 DI 팩토리와 기존 테스트 다수에 번진다. 별건.
- **`inviteChannel`을 비낙관적으로 두고 리페치** — 프로젝트 mutation 규칙에 어긋난다.

## 결과 (Consequences)

**얻은 것**

- 프로덕션 데스크탑에 채널 멤버 추가 경로가 처음 생겼다.
- `inviteChannel`이 나머지 mutation과 같은 규칙을 따른다.
- 유저 캐시가 더 이상 채널별 상태를 들고 있지 않다. 장래에 누가 `user.$join`을 읽어도
  임의 채널의 커서를 받는 함정이 없어졌다.

**치른 것**

- 데스크탑에서 계정 없는 사람을 초대할 수 없다.
- 다이얼로그를 열면 내가 속한 채널 수만큼 `refreshList`가 나간다 — **미측정**.
- 이 변경 이전에 캐시된 유저 행은 `$join`을 계속 갖는다. `cacheWrite`가 spread merge라
  덮어쓰기 전까지 남는다. 읽는 데가 없어 무해하고, 앱 쪽에서 방어적으로 떼고 쓴다.

## 아직 정하지 않은 것

- `channel.invite`의 owner-only 여부 (미검증 — 서버 확인 필요).
- 채널 수가 많은 계정에서 팬아웃이 감당 가능한지.
