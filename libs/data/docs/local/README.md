# Local Data Layer (`libs/data/src/data/local`)

`local` 레이어는 앱이 읽는 로컬 데이터의 저장, 조회, 스트림 발행을 담당합니다.

현재 기준 구현은 V1과 V2가 공존합니다.

- V1: `data-sources`
- V2: `data-sources-v2`
- 공통 저장소: `storages`
- 보조 조회 계층: `databases`

## 역할

- 로컬 snapshot 조회
- 로컬 stream 발행
- partial merge / normalize
- scope(`cid`, `sid`, `uid`) 분리
- repository가 적재한 remote 결과를 UI read-model로 재방출

local 레이어는 remote를 직접 호출하지 않습니다.

## 현재 구조

- `storages`
    - IndexedDB / Native bridge / dynamic cache
- `databases`
    - storage 위 복합 조회
    - 현재 chat query executor 포함
- `data-sources`
    - 기존 local data source
- `data-sources-v2`
    - V2 local data source
    - `cacheRead`, `cacheReadList`, `observeItem`, `observeList`, `cacheWrite`, `cacheDelete`, `cacheClear`

## V2 구현 원칙

- V2는 기존 `data-sources` 확장이 아니라 `data-sources-v2` 신설로 구현합니다.
- 기존 호환성보다 `stream-only read`, `local-first refresh`, `scope-safe sync` 를 우선합니다.
- 기존 동작과 다르더라도 새 방향이 맞다면 V2 기준으로 새로 구현합니다.

## V2 핵심 계약

실제 공통 계약은 [types.ts](/Users/raine/Project/lemon/chatic-front/libs/data/src/data/local/data-sources-v2/types.ts) 에 있습니다.

```ts
interface ILocalDataSourceV2<TItem, TListQuery, TListResult> {
    cacheRead(id: string): Promise<TItem | null>;
    cacheReadList(query: TListQuery): Promise<TListResult | null>;

    observeItem(id: string, callback: (item: TItem | null) => void): () => void;
    observeList(query: TListQuery, callback: (result: TListResult | null) => void): () => void;

    cacheWrite(item: Partial<TItem>): Promise<void>;
    cacheWriteMany(items: Array<Partial<TItem>>): Promise<void>;
    cacheDelete(id: string): Promise<void>;
    cacheDeleteMany(ids: string[]): Promise<void>;
    cacheClear(): Promise<void>;
}
```

## 구현된 V2 도메인

- [ChannelLocalDataSourceV2.ts](/Users/raine/Project/lemon/chatic-front/libs/data/src/data/local/data-sources-v2/ChannelLocalDataSourceV2.ts)
- [ChatLocalDataSourceV2.ts](/Users/raine/Project/lemon/chatic-front/libs/data/src/data/local/data-sources-v2/ChatLocalDataSourceV2.ts)
- [JoinLocalDataSourceV2.ts](/Users/raine/Project/lemon/chatic-front/libs/data/src/data/local/data-sources-v2/JoinLocalDataSourceV2.ts)
- [PlaceLocalDataSourceV2.ts](/Users/raine/Project/lemon/chatic-front/libs/data/src/data/local/data-sources-v2/PlaceLocalDataSourceV2.ts)
- [ProfileLocalDataSourceV2.ts](/Users/raine/Project/lemon/chatic-front/libs/data/src/data/local/data-sources-v2/ProfileLocalDataSourceV2.ts)
- [SiteLocalDataSourceV2.ts](/Users/raine/Project/lemon/chatic-front/libs/data/src/data/local/data-sources-v2/SiteLocalDataSourceV2.ts)
- [UserLocalDataSourceV2.ts](/Users/raine/Project/lemon/chatic-front/libs/data/src/data/local/data-sources-v2/UserLocalDataSourceV2.ts)
- [InviteCloudLocalDataSourceV2.ts](/Users/raine/Project/lemon/chatic-front/libs/data/src/data/local/data-sources-v2/InviteCloudLocalDataSourceV2.ts)

팩토리 진입점:

- [index.ts](/Users/raine/Project/lemon/chatic-front/libs/data/src/data/local/data-sources-v2/index.ts)

## stream 모델

V2의 핵심은 `BaseLocalDataSourceV2` 입니다.

- item observer / list observer 분리
- query key 기반 list observer 저장
- mutation 후 전체 재발행이 아니라 영향 범위 prefix 기반 재발행
- `scheduleItemReemit`, `scheduleListReemit`, `scheduleFullReemit` 제공

즉, UI는 항상 `observe*` 만 보고, repository가 로컬을 건드리면 필요한 observer만 다시 계산됩니다.

## 서버 sync 스펙과의 관계

기준 문서:

- [sync/README.md](/Users/raine/Project/lemon/chatic-front/libs/data/docs/sync/README.md)

local 레이어는 sync 주체가 아닙니다.

- `channel.sync({ since })` 결과를 저장하고 재방출
- `chat.feed` 결과를 저장하고 재방출
- `channel.sync.ids` 기반 stale remove 결과를 반영
- `chat.read`, `channel.leave`, `channel.delete` 같은 명령 결과를 반영

즉, V2 local은 "동기화 로직"이 아니라 "동기화 결과를 안전하게 저장하고 stream으로 내보내는 계층"입니다.

경계 정리:

- `device` polling / trigger scheduler 는 local 레이어의 책임이 아니다.
- latest sync 판단(`channel.chatNo` 비교), `since` 저장, stale remove 결정은 repository / orchestration 레이어 책임이다.
- local은 그 결과를 query 단위 snapshot과 stream으로 재방출한다.

profile 관련 추가 메모:

- `CacheType.profile` TTL 정책이 존재하며, `ProfileLocalDataSourceV2`에서 실제로 사용된다.
- `ProfileRepositoryV2`가 `profile.sync` 결과를 upsert/remove하고, local stream을 통해 UI에 노출한다.

## 채팅 커서와 local

채팅은 cursor 기반이지만, local의 역할은 cursor를 계산하는 것이 아니라 repository가 요청한 query를 기준으로 snapshot을 반환하는 것입니다.

현재 `ChatLocalDataSourceV2` 기준:

- `cacheReadList({ channelId, cursorNo?, limit? })`
- `observeList({ channelId, cursorNo?, limit? })`
- `cacheClearByChannelId(channelId)`

주의:

- 최신 페이지와 이전 페이지는 query가 다르므로 observer key도 다릅니다.
- `chat.feed` 응답 merge 정책은 repository가 책임집니다.
- `cursorNo`는 이전 페이지 조회용 query 구분자이지, 최신 chat sync 기준값이 아닙니다.
- local은 페이지 단위 snapshot 제공과 channel 단위 stream 재방출에 집중합니다.

## cache clear 원칙

- `cacheClear()` 는 전체 clear가 아니라 현재 storage scope 기준 clear 입니다.
- `chat` 은 `cacheClearByChannelId(channelId)` 를 별도로 지원합니다.
- 로그아웃, cloud 전환, 테스트 초기화에서 clear 범위를 명확히 결정해야 합니다.
- profile 이 추가되면 item cache 중심으로 `cacheDelete(profileId)` 와 scope clear 기준을 먼저 맞추는 편이 좋습니다.

## 구현 / 테스트 시 주의 사항

- context는 인스턴스 생성 시점이 아니라 호출 시점 기준으로 읽혀야 합니다.
- 요청 시점 context와 응답 시점 context가 달라질 수 있으므로 repository에서 scope를 캡처해야 합니다.
- `sid` fallback 오류는 cross-place 오염으로 이어집니다.
- `chat.feed` 는 overwrite보다 merge가 중요합니다.
- 기존 V1 hook이 기대하던 타이밍보다 V2가 맞다면 V2 기준으로 다시 설계합니다.
