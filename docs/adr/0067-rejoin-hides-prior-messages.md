# ADR-0067: 재입장은 처음 들어온 것과 같아야 한다 — joinedNo 표시 게이트와 chat 캐시 purge

> 상태: Accepted · 결정일: 2026-08-25

## 맥락 (Context)

서버(`chatic-socials-api`)가 `0.26.810a`(PR #28, `fix(joins): reset cursors on re-join so prior messages stay hidden`)에서 재입장 커서 리셋을 고쳤다. `makeJoin`의 재활성 경로가 커서를 프록시 캐시에서 떠낸 복사본에 병합해 저장이 누락되던 문제로, 병합 대상을 `inc`가 돌려준 캐시 노드로 바꾸고 덮어쓸 필드를 `chatNo`·`joinedNo`·`metaNo`·`notify` 넷으로 좁혔다. 이제 재입장 시 저장소의 커서가 채널 현재값으로 리셋되고, 피드는 `listFeed`의 `chatNo > joinedNo` 규칙에 걸려 퇴장 전 메시지를 돌려주지 않는다.

**그런데 이 수정만으로는 앱 화면이 전혀 달라지지 않는다.** 클라이언트는 서버 응답을 렌더하지 않고 로컬 캐시를 구독해 렌더하기 때문이다.

### 서버 fix가 화면에 닿지 않는 이유

메시지 스트림은 [`useChats`](../../apps/web/src/app/features/channels/hooks/useChats.ts)의 `chatRepository.observeList` — 캐시 구독이다. 그리고 퇴장 경로 어디서도 chat 캐시를 치우지 않는다:

- [`ChannelRepositoryV2.leaveChannel`](../../libs/data/src/data/repositories-v2/ChannelRepositoryV2.ts)은 **channel** 캐시만 지운다.
- `ChatSyncPlan`에는 `onRemove`가 없다 — [`plans.ts`](../../libs/app-runtime/src/socket/sync/plans.ts) 주석이 "메시지 이력은 lazy-load/오프라인을 위해 유지한다"고 의도적으로 밝혀 둔 설계다.
- `ChatRepositoryV2.refreshList`는 `cacheWriteMany`만 하고 prune하지 않는다. 서버가 더 이상 주지 않는 행은 그대로 남는다.
- `cacheClearByChannelId`는 존재하지만 **프로덕션 호출자가 0건**이다.
- 캐시는 네이티브 SQLite / IndexedDB 영속이라 앱을 재시작해도 남는다.

누수는 세 갈래다. **피드**(방에 들어가면 퇴장 전 대화가 그대로), **홈 프리뷰**(`observeLastList`도 같은 chat 캐시 파생이라 서버가 `getByChannel({joinedNo})`로 null을 줘도 옛 메시지가 프리뷰로 남는다), **전역 검색**(`IndexedDbGlobalSearchSource`가 chat 테이블 전체를 훑고, [`useSearchContext`](../../apps/web/src/app/features/search/hooks/useSearchContext.ts)는 채널 행이 없는 chat을 버리지 않고 `channelName: undefined`로 렌더한다 — 재입장과 무관하게 지금도 나간 채널 메시지가 검색된다).

### 그 앞을 막는 별개의 버그

[`ChannelRepositoryV2`](../../libs/data/src/data/repositories-v2/ChannelRepositoryV2.ts)의 `leftChannelIds`는 인메모리 Set으로 `refreshList`와 `syncChannels` **둘 다**를 필터하는데, 지워지는 곳은 leave 실패 롤백뿐이다. [`DataManager`](../../libs/app-runtime/src/data/DataManager.ts)는 repositories를 생성자에서 한 번만 만들고 `ensure()`로 컨텍스트만 갈아끼우므로 이 Set은 클라우드 전환에도 살아남는다. 즉 **나갔다가 다시 초대받으면 새로고침 전까지 채널이 목록에 돌아오지 않는다.** 재입장 동작을 검증할 수조차 없다.

### 브릿지에 대해 확인한 것

네이티브 chat 테이블은 이미 `channel_id` 컬럼으로 필터한다([`ChatDataSource`](../../apps/mobile/src/app/data/cache/ChatDataSource.ts)) — 방 피드를 읽는 바로 그 경로라 **배포된 모든 앱 빌드가 지원한다**. 따라서 채널 한정 purge에 브릿지 신규 메시지는 필수가 아니다. [`storages/types.ts`](../../libs/data/src/data/local/storages/types.ts)의 "테이블 전체를 브릿지로 끌어온다"는 경고는 base가 `loadAll()`을 인자 없이 부르기 때문이고, `ChatQueryOptions.channelId`가 있는 chat에는 해당하지 않는다.

### API 계약

이번 서버 변경에 스키마 변화는 없다. 클라의 `^0.26.721` caret이 `0.26.810a`를 이미 커버하므로 타입/버전 대응은 불필요하다. 응답에서 `stereo`·`sid`·`nick`·`role`이 이제 보존값으로 내려오지만 클라는 `join.stereo`를 읽는 곳이 없다.

## 결정 (Decision)

### 1. joinedNo 표시 게이트를 세 소비 지점에 건다

`myJoin.joinedNo` 이하의 `chatNo`를 렌더 단계에서 드롭한다. 서버 `listFeed`와 같은 근거를 쓰므로 규칙이 두 벌로 갈라지지 않는다. 적용 지점은 **방 피드**, **홈 마지막 메시지 프리뷰**, **전역 검색 결과** 셋 다. 검색은 컨텍스트가 이미 `joinsByRef`(channelId 키, 내 join)를 unread 계산용으로 싣고 있어 재료가 준비돼 있다.

이 게이트는 purge의 중복이 아니라 **소급 방어선**이다. 배포 시점에 이미 캐시를 쌓아 둔 기존 설치 베이스와, purge 신호가 닿지 않는 경로(아래 4)를 이것이 덮는다.

### 2. chat 캐시 purge는 명시 신호에만 붙인다

- `leaveChannel` 성공 (self-leave)
- `JoinSyncPlan.onRemove`가 **내** join 행을 지울 때

`ChannelSyncPlan.onRemove`와 `syncChannels`의 stale prune에는 붙이지 않는다. 채널 캐시 오삭제는 서버가 다시 채워주지만 **chat 오삭제는 복구가 안 된다** — 서버는 `joinedNo` 이후만 주기 때문이다. 추론 기반 prune의 오판 한 번이 이력을 영구히 날리는 쪽보다, 누수를 표시 게이트에 맡기는 쪽을 택한다.

### 3. 브릿지에 `ClearCacheDataByChannel`을 추가하고, 폴백을 정본 경로로 둔다

- **폴백(모든 앱 빌드에서 동작):** `loadAll({ channelId })` → ids → `deleteAll(ids)`. 왕복 2회, 한 채널분만 오간다. `ChatLocalDataSourceV2`가 `TType='chat'`을 알고 있으므로 타입 안전하게 직접 처리한다.
- **최적화(신규 메시지):** 네이티브에서 `DELETE … WHERE cid=? AND uid=? AND channel_id=?` 한 방. 왕복 1회, 페이로드 0.
- **폴백 전환:** 이 메시지를 모르는 앱 빌드의 `NOT_FOUND`를 1회 받으면 학습해 이후로는 시도하지 않는다. `FetchManyCacheData`·`FetchLastChats`가 이미 쓰는 선례를 그대로 따른다.

기존 `ClearCacheData`에 `channelId`를 얹는 방식은 채택하지 않는다 — 구버전 앱이 모르는 필드를 무시하고 **해당 스코프의 chat 테이블 전체를 지운다.**

### 4. `leftChannelIds`를 영구 블록에서 시한부 가드로 바꾼다

이 Set의 목적은 "leave 직전에 발행된 in-flight 응답이 방금 지운 채널을 되살리는 것"을 막는 레이스 가드다. 그 목적에는 짧은 유예로 충분하고, 세션 내내 유지될 이유가 없다. 유예 값과 만료 처리 방식은 스펙에서 정한다.

### 5. `notify` 리셋은 서버를 그대로 따른다

재입장하면 음소거가 풀리는 것은 서버 의도된 동작이다. 클라는 값을 반영만 하고 별도 안내 UI를 만들지 않는다.

### 범위 밖

- `apps/desktop-web` — 참조만 하고 수정하지 않는다.
- 일회성 캐시 마이그레이션 — 표시 게이트가 소급 커버를 맡는다.
- `joinedNo` 전진을 감지한 자동 purge — 삭제 경로를 명시 신호 하나로 유지한다.
- `apps/testbed`.

## 대안 (Alternatives)

**표시 게이트만 하고 캐시는 손대지 않는다.** 브릿지 무관에 즉시 배포 가능하지만, 나간 채널의 메시지가 캐시와 검색 인덱스에 영구히 남는다. 전역 검색 누수는 이 방식으로 못 고친다.

**purge를 채널 소멸 전 경로에 붙인다.** 강퇴·타기기 퇴장까지 누수 없이 덮지만, 추론 기반 prune의 오판이 복구 불가능한 이력 손실로 직결된다. 손실의 비대칭성(채널 오삭제는 값싸고 chat 오삭제는 영구) 때문에 버렸다.

**`ClearCacheData`에 `channelId` 필드를 추가한다.** 메시지 하나로 끝나지만 구버전 앱이 필드를 무시하고 테이블 전체를 지운다. 웹이 앱보다 먼저 배포되는 구조에서 이건 조용한 데이터 손실이다.

**`joinedNo` 전진을 감지해 그 이하를 자동 purge한다.** 마이그레이션 없이 기존 캐시까지 정리되고 강퇴 경로도 덮이지만, 삭제 트리거가 명시 신호 하나에서 파생 신호로 늘어난다. 삭제 경로를 좁게 유지하는 쪽을 택했다.

**일회성 정리 마이그레이션.** 캐시 용량까지 회수하지만 비가역이고, 표시 게이트로 같은 사용자 효과를 되돌릴 수 있게 얻는다.

## 결과 (Consequences)

**얻는 것**

- 재입장이 실제로 처음 들어온 것처럼 보인다 — 피드·홈 프리뷰·검색 세 곳 모두.
- 기존 누수 하나가 같이 닫힌다: 나간 채널의 메시지가 채널명 없이 전역 검색에 뜨던 문제.
- 재입장한 채널이 세션 안에서 목록으로 돌아온다.
- **웹만 배포해도 전부 동작한다.** 앱 배포는 purge를 왕복 1회로 줄이는 최적화일 뿐이고, 앱이 따라오면 학습 폴백이 알아서 빠른 경로로 전환된다.

**감수하는 것**

- **강퇴·타기기 퇴장은 purge되지 않는다.** [`useChannelMutations`](../../apps/web/src/app/features/channels/hooks/useChannelMutations.ts) 주석이 밝히듯 서버는 강퇴 대상자에게 join 갱신을 푸시하지 않는다 — 강퇴당한 기기에서 `JoinSyncPlan.onRemove`는 신뢰할 수 없다. 이 경로는 표시 게이트만으로 가려지고 캐시에는 데이터가 남는다.
- **첫 페인트 노출 창.** `joinedNo`는 방 진입 시 `syncChannelUsers`의 `$join`으로 갱신되므로, 재입장 직후 그 응답이 오기 전 한 프레임 동안 게이트가 옛(더 작은) 값으로 동작한다.
- **캐시 용량은 즉시 회수되지 않는다.** 게이트가 가릴 뿐이므로 기존 설치 베이스의 옛 행은 남는다.
- **`openFeed`와 충돌한다.** 서버에는 `joinedNo` 가드를 무시하는 `openFeed`가 있고 클라는 지금 이 값을 어디서도 보내지 않는다. 훗날 "과거 이력 공개" 기능을 도입하면 표시 게이트를 그 채널에서 꺼야 한다.
- 브릿지 메시지가 하나 늘어난다 — 네이티브 구현·QA·앱 배포가 따라붙는다.

**후속**

`leftChannelIds` 수정 전까지는 재입장 QA가 앱 재시작을 전제로 해야 한다. 구현 순서는 이 가드를 먼저 푸는 쪽이 나머지 검증을 가능하게 한다.
