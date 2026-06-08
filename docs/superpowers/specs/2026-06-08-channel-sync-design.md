# Channel Sync Design

## 배경

현재 채널 목록은 `channel.mine` API로만 가져오고 있다. 이 방식은 매번 전체 목록을 받아오며, `syncedAt` cursor가 없어 delta sync가 불가능하고, 삭제/이탈 감지를 위한 전체 active ID 목록도 제공하지 않는다.

`channel.sync` API를 도입하여 로컬 캐시를 효율적으로 유지하고, 삭제/이탈 감지를 확실하게 처리한다.

## API 스펙

### channel.mine (기존)

- 일반 목록 조회용, limit/page 기반 pagination
- place 기준 조회
- 응답에 syncedAt, active ID 목록 없음

### channel.sync (신규 도입)

**요청:**

```typescript
{
  type: 'channel.sync',
  data: {
    since: number // timestamp, 0이면 전체 조회
  }
}
```

**응답:**

```typescript
{
  type: 'channel.sync.ok',
  data: {
    list: ChannelView[]  // since 이후 변경된 채널만
    ids: string[]        // 현재 활성 채널 전체 ID
    syncedAt: number     // 다음 요청의 since 값
  }
}
```

## 접근 방식: Sync-Primary with Mine Fallback

- `channel.sync`: 클라우드 단위 동기화의 주 메커니즘
- `channel.mine`: place 전환 시 즉시 렌더용으로만 사용

## 동기화 흐름

```
클라우드 연결 + 인증 완료 ──→ channel.sync(since:0) ──→ [syncedAt 저장 (per cloud)]
                                                              │
Place 전환 ──→ channel.mine (해당 place 채널 즉시 렌더)        │
                                                              │
                                    ┌─────────────────────────┤
                                    ▼                         ▼
                              WS 재연결              포그라운드 복귀
                                    │                         │
                                    ▼                         ▼
                           sync(since:saved)          sync(since:saved)
                                    │                         │
                                    ▼                         ▼
                              [syncedAt 갱신]          [syncedAt 갱신]
```

### 트리거 시점 (3가지)

1. **클라우드 인증 완료** — `sync(since: 0)` full sync
2. **WebSocket 재연결** — `sync(since: savedSyncedAt)` delta sync
3. **포그라운드 복귀** — `sync(since: savedSyncedAt)` delta sync

주기적 polling은 사용하지 않는다.

### 실시간 이벤트 (기존 유지)

sync 사이 구간에서 개별 WebSocket 이벤트로 로컬 캐시를 즉시 반영한다:

- `channel:create/update` → 로컬 캐시 upsert
- `channel:delete` → 로컬에서 제거
- `chat:create` → `lastChat$`, unreadCount 갱신

sync는 이 이벤트들 사이에 놓친 변경을 보정하는 역할이다.

## Sync 응답 처리 (Reconciliation)

```
channel.sync 응답 수신
    │
    ├─ list (변경된 채널들)
    │   └─ 각 채널: 로컬 캐시에 upsert (있으면 덮어쓰기, 없으면 추가)
    │
    ├─ ids (현재 활성 채널 전체 ID)
    │   └─ 로컬 캐시 ID와 비교
    │       → 로컬에 있지만 ids에 없는 채널 → 로컬에서 제거
    │
    └─ syncedAt
        └─ 클라우드별 store에 저장
```

**규칙:**

- `list`의 채널 → 무조건 로컬 덮어쓰기 (서버가 최신)
- 로컬 ID not in `ids` → 삭제/이탈됨, 로컬에서 제거
- 로컬 ID in `ids` but not in `list` → 변경 없음, 유지

## 상태 모델

`syncedAt`은 클라우드별로 메모리(Zustand store)에 보관한다. 앱 재시작 시 `since: 0`으로 full sync.

**Sync 상태 값:**

- `idle` — 아직 sync 안 함
- `syncing` — sync 요청 중
- `synced` — 동기화 완료
- `error` — sync 실패 (재시도 필요)

## 코드 변경 범위

### 수정

| 파일                                                                | 변경 내용                                                                                                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `libs/data/src/data/remote/data-sources/ChannelRemoteDataSource.ts` | `syncChannel(since: number)` 메서드 추가. WebSocket `channel.sync` 전송 + `channel.sync.ok` 응답 수신                                             |
| `libs/data/src/data/repositories/ChannelRepository.ts`              | `sync(since: number)` 메서드 추가. list upsert + ids reconciliation + syncedAt 반환                                                               |
| `apps/web/src/app/shared/hooks/useChannels.ts`                      | 15초 polling 제거. 클라우드 인증 완료 시 `sync(since:0)`, WS 재연결/포그라운드 복귀 시 `sync(since:saved)`, place 전환 시에만 `channel.mine` 유지 |

### 추가

| 파일                                                    | 내용                                                                          |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `apps/web/src/app/shared/stores/useChannelSyncStore.ts` | Zustand store. 클라우드별 syncedAt, sync 상태(idle/syncing/synced/error) 관리 |

### 변경 없음

| 파일                      | 이유                                                             |
| ------------------------- | ---------------------------------------------------------------- |
| `IndexedDBChannelAdapter` | 로컬 캐시 저장소 인터페이스 그대로 사용                          |
| `ChannelLocalDataSource`  | upsert/delete 인터페이스 그대로 사용                             |
| 실시간 이벤트 리스너      | 기존 `channel:create/update/delete` 핸들러 유지                  |
| `useWebSocketV2.ts`       | v1↔v2 브릿지에 매핑 추가 불필요. 1:1 매핑은 fall-through 처리됨 |
