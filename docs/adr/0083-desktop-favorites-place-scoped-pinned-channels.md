# ADR-0083: desktop 즐겨찾기는 `ui.pinnedChannels`(place 스코프)로 옮기고, 로그아웃 때 지운다

> 상태: Accepted · 결정일: 2026-09-11 · 구현: `3a65fef9` · `ec59ca7b` · `c50dd01e` · `6f12d9ac` ·
> `3fd4604a` · `0879cb5a` · `3bbf995c` · `0cc9106e` · `45f1664c` · `278f213e` · `14c8100`
> 범위: `libs/shared/src/preferences/**` · `libs/config/src/registry/ui.ts` ·
> `apps/desktop-web/src/app/features/chat/components/{ChannelList,SortableSection,ChannelRowMenu}.tsx` ·
> `apps/desktop-web/src/app/shared/{hooks/useAccountResetOnLogout.ts,utils/migrateLegacyFavorites.ts}` · `apps/web/src/app/stores/**`
> 관련: [ADR-0079](./0079-config-registry-and-lane-resolver.md) (`ui.*` 레코드·lane), KB dou-app-place-list-ordering

## 맥락 (Context)

desktop-web 사이드바에 즐겨찾기(핀), 드래그 재정렬, 행 컨텍스트 메뉴를 얹는다. 즐겨찾기의 저장소가 문제였다.

- desktop에는 자체 `useFavoriteChannelsStore`(`chatic-favorite-channels`, zustand persist)가 있었다.
  CLAUDE.md twin 규칙이 금하는 그대로 — apps/web의 핀과 별개 트윈이고, 배열 순서가 없어 정렬과 결합할 수 없다.
- 반면 apps/web의 핀은 `ui.pinnedChannels`(config registry, place 스코프, 순서 있는 배열)에 이미 있다.
  `placeScopeKey(cloudId, siteId)` 하나에 장소별 배열 — 정렬이 "핀 배열 순서 = 표시 순서"로 공짜다.

## 결정 (Decision)

### 1. desktop favorites는 `ui.pinnedChannels`를 읽는다 — 트윈을 지운다

`usePinnedChannels(scope)`·`setChannelPinned`·파서를 `libs/shared/src/preferences/`로 올리고,
apps/web은 그쪽에서 import한다(동작 불변). desktop의 `useFavoriteChannelsStore`는 삭제했다.
즐겨찾기 섹션은 핀 배열 순서 그대로를 표시 순서로 쓴다.

### 2. 채널 순서는 `ui.channelOrder`(config registry, place 스코프 JSON)에 저장한다

`applyChannelOrder(ids, stored)` = 저장된 id(존재하는 것만, 저장 순) + 나머지 이름순.
`moveChannel`은 없는 id를 가지치기한다. 섹션(Channels/DMs)별 DnD는 한 배열의 자기 슬라이스만 재작성하고,
즐겨찾기 재정렬은 `ui.pinnedChannels[scope]` 배열에 직접 쓴다. 새 채널은 이름순 끝에, 삭제된 채널은
다음 쓰기 때 가지치기 — 별도 리셋 UI는 v1에 없다. 핀은 예외다: 재정렬은 화면에 보이는 핀의 순서만
받고, 목록에 잠시 없는 핀(재입장·sync 지연)은 제자리를 지킨다(`setPinnedChannelOrder`). 핀을 지우는
경로는 해제(`toggle`) 하나다.

### 3. 레거시 favorites는 place를 처음 볼 때 lazy migrate 한다

id에 place 정보가 없으므로: 그 place 채널 목록에 존재하는 id만 스코프로 이동(append, dedupe),
나머지는 구 키에 남겨 다른 place에서 마이그레이션 기회를 남긴다. 비면 키 삭제, 깨진 JSON은 무음 삭제.
로그아웃은 `chatic-favorite-channels`도 계속 클리어한다 — 미마이그레이션 잔여 id가 다음 계정으로
새는 것을 막는다(플랜 체크리스트의 "구 키 제거"에서 diverge, spec의 logout 불변식이 우선).

### 4. 로그아웃은 `ui.pinnedChannels`/`ui.channelOrder`를 클리어한다

`config.clear(..., { lane: 'local' })`로 저장된 키와 메모리 레인 값을 함께 지운다. 공용 place에서
다음 계정으로 핀/순서가 새는 것을 막는다. apps/web은 클리어하지 않는다 — 웹은 로그아웃이 곧
리로드가 아니고, 플랜 결정(Decision 표 "Logout: clear both config keys")이 desktop에만 적용된다.

### 5. 컨텍스트 메뉴는 행당 인스턴스가 아니라 사이드바당 하나다

`ChannelRowMenu`가 열 때 `menuTargetId`를 기록하고, dialogs(Rename/AddMembers/Confirm)는
ChannelList에 한 번만 렌더된다. `onRemoved`는 **제거된 행이 열려 있는 채널일 때만** 선택을
지운다 — 배경 채널에서 leave하면 채팅 창이 유지된다(통합 스펙으로 고정).

## 대안 (Alternatives)

- **desktop zustand 유지 + 변환 레이어**: 트윈이 남고, 순서 저장이 또 한 벌 필요하다. 기각.
- **즐겨찾기 로그아웃 시 보존**: apps/web과의 불일치를 줄이지만, 공용 place에서 계정 간 누수. 기각.
- **전역 migration(기동 시 일괄)**: 채널 목록이 place마다 다르므로 기각 — lazy가 id↔place를 정확히 풀린다.

## 결과 (Consequences)

- 알림 모드 해석(`channelNotifyMode(state, id, joinNotify?)`)·핀·순서가 모두 `libs/shared`/config로
  모였다 — 표면이 달라도 레코드는 하나다.
- 표시 순서가 서버가 아니라 클라이언트 레코드가 되므로, 서버 `channel` 순서 필드가 생겨도 리더만 바꾸면 된다.
- trade-off: 로그아웃마다 핀/순서가 사라진다(의도 — 공용 기기 전제). 웹과 동작이 다름은 이 ADR이 기록한다.
