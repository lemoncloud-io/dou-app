# Channel Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace polling-based channel list refresh with delta-sync via `channel.sync` API, keeping `channel.mine` only for place-switch quick render.

**Architecture:** `channel.sync` is a WebSocket request-response API at the cloud level. The client sends `{ since: timestamp }` and receives `{ list: ChannelView[], ids: string[], syncedAt: number }`. `list` contains only changed channels; `ids` contains all active channel IDs for deletion/leave detection. `syncedAt` is the cursor for the next request.

**Tech Stack:** WebSocket (v1↔v2 bridge), Zustand (sync state store), IndexedDB (local cache via existing adapters)

---

## File Structure

| Action | File                                                                | Responsibility                                                        |
| ------ | ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Modify | `libs/data/src/data/events/common.ts`                               | Add `ChannelSyncResult` type                                          |
| Modify | `libs/data/src/data/events/socket.ts`                               | Add `'channel:sync'` to `SocketEventMap`                              |
| Modify | `libs/data/src/data/events/domain.ts`                               | Add `'channel:sync'` to `DomainEventMap`                              |
| Modify | `libs/socket/src/hooks/useWebSocketV2.ts`                           | Add outbound/inbound type mappings for `channel.sync`                 |
| Modify | `libs/data/src/data/remote/sockets/handlers/chatHandler.ts`         | Add `case 'sync'` to dispatch `'channel:sync'` event                  |
| Modify | `libs/data/src/data/remote/data-sources/ChannelRemoteDataSource.ts` | Add `syncChannel()` method + socket→domain bridge                     |
| Modify | `libs/data/src/data/repositories/ChannelRepository.ts`              | Implement `syncChannels()` with upsert + reconciliation               |
| Create | `apps/web/src/app/shared/stores/useChannelSyncStore.ts`             | Zustand store for per-cloud `syncedAt` and sync status                |
| Modify | `apps/web/src/app/shared/hooks/useChannels.ts`                      | Remove polling, add sync triggers (cloud auth, reconnect, foreground) |

---

### Task 1: Add `ChannelSyncResult` Type to Event Layer

**Files:**

- Modify: `libs/data/src/data/events/common.ts`
- Modify: `libs/data/src/data/events/socket.ts`
- Modify: `libs/data/src/data/events/domain.ts`

- [ ] **Step 1: Define `ChannelSyncResult` in common.ts**

Add to the end of `libs/data/src/data/events/common.ts`:

```typescript
/** channel.sync 응답 구조 */
export interface ChannelSyncResult {
    /** since 이후 변경된 채널 목록 */
    list: ChannelView[];
    /** 현재 활성 채널 전체 ID 배열 */
    ids: string[];
    /** 다음 sync 요청에 사용할 cursor timestamp */
    syncedAt: number;
}
```

Note: `ChannelView` import가 이미 `socket.ts`에 있지만 `common.ts`에는 없으므로 import를 추가해야 합니다.

```typescript
import type { ChannelView } from '@lemoncloud/chatic-socials-api';
```

- [ ] **Step 2: Add `'channel:sync'` to `SocketEventMap`**

In `libs/data/src/data/events/socket.ts`, Channel 섹션에 추가:

```typescript
// 기존 channel 이벤트들 아래에 추가
'channel:sync': SocketEventDetail<ChannelSyncResult>;
```

`ChannelSyncResult`를 import에 추가:

```typescript
import type { ListResult, Synced, ChannelSyncResult } from './common';
```

- [ ] **Step 3: Add `'channel:sync'` to `DomainEventMap`**

In `libs/data/src/data/events/domain.ts`, Channel 섹션에 추가:

```typescript
// 'channel:list' 아래에 추가
/** 채널 동기화 결과 (channel.sync 대응) */
'channel:sync': DomainPayload<ChannelSyncResult>;
```

`ChannelSyncResult`를 import에 추가:

```typescript
import type { ListResult, ChannelSyncResult } from './common';
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx nx run data:build --skip-nx-cache` (또는 `npx tsc --noEmit -p libs/data/tsconfig.lib.json`)
Expected: 빌드 성공, 타입 에러 없음

- [ ] **Step 5: Commit**

```bash
git add libs/data/src/data/events/common.ts libs/data/src/data/events/socket.ts libs/data/src/data/events/domain.ts
git commit -m "feat(data): add ChannelSyncResult type and channel:sync events"
```

---

### Task 2: Add WebSocket v1↔v2 Bridge Mappings

**Files:**

- Modify: `libs/socket/src/hooks/useWebSocketV2.ts:65-91`

- [ ] **Step 1: Add outbound mapping**

In `OUTBOUND_TYPE_MAP` (line 65-76), add:

```typescript
'chat.sync': 'channel.sync',
```

This maps outbound `wssClient.send('chat', 'sync', ...)` to v2 `channel.sync`.

- [ ] **Step 2: Add inbound mapping**

In `INBOUND_TYPE_MAP` (line 80-91), add:

```typescript
'channel.sync': { domain: 'chat', action: 'sync' },
```

This maps inbound `channel.sync:ok` response back to `{ type: 'chat', action: 'sync' }` WSSEnvelope, so the SocketDispatcher routes it to `chatHandler`.

- [ ] **Step 3: Commit**

```bash
git add libs/socket/src/hooks/useWebSocketV2.ts
git commit -m "feat(socket): add channel.sync v1↔v2 bridge mappings"
```

---

### Task 3: Add `sync` Case to chatHandler

**Files:**

- Modify: `libs/data/src/data/remote/sockets/handlers/chatHandler.ts`

- [ ] **Step 1: Add import for ChannelSyncResult**

```typescript
import type { ListResult, SocketEventMap, ChannelSyncResult } from '../../../events/types';
```

(`ChannelSyncResult`를 기존 import에 추가)

- [ ] **Step 2: Add `case 'sync'` to the switch statement**

`chatHandler.ts`의 switch문에서 `case 'mine':` 블록 아래에 추가:

```typescript
// 채널 동기화 결과 처리
case 'sync':
    eventBus.emit('channel:sync', { ...detail, payload: payload as ChannelSyncResult });
    break;
```

- [ ] **Step 3: Commit**

```bash
git add libs/data/src/data/remote/sockets/handlers/chatHandler.ts
git commit -m "feat(data): add sync case to chatHandler for channel.sync responses"
```

---

### Task 4: Add `syncChannel` to ChannelRemoteDataSource

**Files:**

- Modify: `libs/data/src/data/remote/data-sources/ChannelRemoteDataSource.ts`

- [ ] **Step 1: Add `syncChannel` to `IChannelRemoteDataSource` interface**

```typescript
export interface IChannelRemoteDataSource {
    // ... 기존 메서드들 ...

    /** 채널 동기화를 서버에 요청합니다. */
    syncChannel(payload: { since: number }, ref?: string): void;
}
```

- [ ] **Step 2: Add socket→domain event bridge for `channel:sync`**

`initializeListeners()` 메서드에 추가:

```typescript
this.socketEventBus.on('channel:sync', detail => {
    this.domainEventBus.emit('channel:sync', {
        data: detail.payload as ChannelSyncResult,
        ref: detail.ref,
    });
});
```

`ChannelSyncResult` import 추가:

```typescript
import type { ChannelSyncResult } from '../../events/common';
```

- [ ] **Step 3: Implement `syncChannel` method**

```typescript
public syncChannel(payload: { since: number }, ref?: string) {
    this.wssClient.send('chat' as WSSEventDomainType, 'sync' as WSSActionType, payload, ref);
}
```

`WSSEventDomainType`와 `WSSActionType` import 추가 (아직 없다면):

```typescript
import type { WSSEventDomainType, WSSActionType } from '@lemoncloud/chatic-sockets-api';
```

Note: `'chat'`과 `'sync'`가 해당 타입의 유니온에 포함되지 않을 수 있으므로 `as` 캐스트 사용. 이는 v1↔v2 bridge를 위해 의도된 것.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx nx run data:build --skip-nx-cache`
Expected: 빌드 성공

- [ ] **Step 5: Commit**

```bash
git add libs/data/src/data/remote/data-sources/ChannelRemoteDataSource.ts
git commit -m "feat(data): add syncChannel method to ChannelRemoteDataSource"
```

---

### Task 5: Implement `syncChannels` in ChannelRepository

**Files:**

- Modify: `libs/data/src/data/repositories/ChannelRepository.ts`

- [ ] **Step 1: Add `syncChannels` to `IChannelRepository` interface**

```typescript
export interface IChannelRepository extends ILocalCacheMutationRepository<DomainChannel> {
    // ... 기존 메서드들 ...

    /** 서버와 채널 목록을 동기화합니다. since 이후 변경분만 반영하고 삭제/이탈 채널을 제거합니다. */
    syncChannels(since: number): Promise<{ syncedAt: number; updatedCount: number; removedCount: number }>;
}
```

- [ ] **Step 2: Import `ChannelSyncResult`**

```typescript
import type { ChannelSyncResult } from '../events/common';
```

- [ ] **Step 3: Implement `syncChannels` method**

`ChannelRepository` 클래스에 추가:

```typescript
public async syncChannels(since: number): Promise<{ syncedAt: number; updatedCount: number; removedCount: number }> {
    const requestScope = this.getDomainScope();
    const requestContext = this.getRepositoryContext();

    const result = await this.requestRemote<ChannelSyncResult>(
        ref => this.channelRemoteDataSource.syncChannel({ since }, ref)
    );

    // cloud 전환 감지 — cross-cloud 오염 방지
    const currentCid = this.getRepositoryContext().cid;
    if (currentCid !== requestContext.cid) {
        return { syncedAt: result.syncedAt, updatedCount: 0, removedCount: 0 };
    }

    // 1. 변경된 채널 upsert
    const domainList = (result.list || [])
        .map(item => ({
            ...toDomainChannel(item, requestScope),
            cid: requestScope.cid,
        }))
        .filter(ch => !ch.id || !this.leftChannelIds.has(ch.id));

    if (domainList.length > 0) {
        await this.channelLocalDataSource.upsertMany(domainList, requestContext);
    }

    // 2. 삭제/이탈 감지: 로컬에 있지만 서버 ids에 없는 채널 제거
    let removedCount = 0;
    if (result.ids) {
        const activeIds = new Set(result.ids);
        const localResult = await this.channelLocalDataSource.fetchList({}, requestContext);
        const staleIds = (localResult?.list || [])
            .map(ch => ch.id)
            .filter((id): id is string => !!id && !activeIds.has(id));

        if (staleIds.length > 0) {
            await this.channelLocalDataSource.removeMany(staleIds, requestContext);
            removedCount = staleIds.length;
        }
    }

    return { syncedAt: result.syncedAt, updatedCount: domainList.length, removedCount };
}
```

- [ ] **Step 4: Update `sync()` method to use `syncChannels`**

기존 `throw new Error('Method not implemented.')` 를 대체:

```typescript
async sync(_id?: string, meta?: Record<string, unknown>): Promise<void> {
    const since = (meta?.since as number) ?? 0;
    await this.syncChannels(since);
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx nx run data:build --skip-nx-cache`
Expected: 빌드 성공

- [ ] **Step 6: Commit**

```bash
git add libs/data/src/data/repositories/ChannelRepository.ts
git commit -m "feat(data): implement syncChannels with delta upsert and reconciliation"
```

---

### Task 6: Create `useChannelSyncStore`

**Files:**

- Create: `apps/web/src/app/shared/stores/useChannelSyncStore.ts`

- [ ] **Step 1: Create the store file**

```typescript
import { create } from 'zustand';

export type ChannelSyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

export interface ChannelSyncStoreState {
    /** cloud별 syncedAt cursor */
    syncedAtMap: Record<string, number>;
    /** 현재 sync 상태 */
    status: ChannelSyncStatus;
    /** 에러 메시지 (status가 error일 때) */
    errorMessage: string | null;

    /** 특정 cloud의 syncedAt 조회 */
    getSyncedAt: (cloudId: string) => number;
    /** 특정 cloud의 syncedAt 저장 */
    setSyncedAt: (cloudId: string, syncedAt: number) => void;
    /** sync 상태 변경 */
    setStatus: (status: ChannelSyncStatus, errorMessage?: string) => void;
    /** 전체 초기화 */
    reset: () => void;
}

export const useChannelSyncStore = create<ChannelSyncStoreState>((set, get) => ({
    syncedAtMap: {},
    status: 'idle',
    errorMessage: null,

    getSyncedAt: (cloudId: string) => get().syncedAtMap[cloudId] ?? 0,

    setSyncedAt: (cloudId: string, syncedAt: number) =>
        set(prev => ({
            syncedAtMap: { ...prev.syncedAtMap, [cloudId]: syncedAt },
        })),

    setStatus: (status: ChannelSyncStatus, errorMessage?: string) =>
        set({ status, errorMessage: errorMessage ?? null }),

    reset: () => set({ syncedAtMap: {}, status: 'idle', errorMessage: null }),
}));
```

- [ ] **Step 2: Export from stores index (if exists)**

`apps/web/src/app/shared/stores/` 에 index.ts가 있다면 export 추가. 없으면 직접 import로 사용.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx nx run web:build --skip-nx-cache` (또는 타입 체크만)
Expected: 빌드 성공

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/shared/stores/useChannelSyncStore.ts
git commit -m "feat(web): add useChannelSyncStore for per-cloud sync state"
```

---

### Task 7: Refactor `useChannels` to Use Channel Sync

**Files:**

- Modify: `apps/web/src/app/shared/hooks/useChannels.ts`

이 태스크가 가장 크고 핵심적입니다. 기존 `useChannels` 훅을 단계별로 수정합니다.

- [ ] **Step 1: Add imports**

기존 import에 추가:

```typescript
import { useChannelSyncStore } from '../stores/useChannelSyncStore';
import { useConnectionRecoverySync } from './useConnectionRecoverySync';
```

- [ ] **Step 2: Remove polling**

`useChannels` 함수 내에서 다음을 제거:

1. 상단의 상수 `CHANNEL_POLL_INTERVAL_MS` 제거
2. `import { useInterval } from '@chatic/shared';` 제거 (다른 곳에서 사용하지 않는다면)
3. 하단의 `useInterval` 호출 제거:

```typescript
// 삭제:
useInterval(() => void fetchChannels(), targetPlaceId && cloudId ? CHANNEL_POLL_INTERVAL_MS : null);
```

- [ ] **Step 3: Add `syncFromServer` callback**

`fetchChannels` callback 아래에 추가:

```typescript
const syncFromServer = useCallback(async () => {
    if (!cloudId || !isVerified) return;

    const { getSyncedAt, setSyncedAt, setStatus } = useChannelSyncStore.getState();
    const since = getSyncedAt(cloudId);

    setStatus('syncing');
    try {
        const result = await channelRepository.syncChannels(since);
        // cloud 전환 체크
        if (cloudIdRef.current !== cloudId) return;

        setSyncedAt(cloudId, result.syncedAt);
        setStatus('synced');

        // sync로 캐시가 변경되었으면 화면에 반영
        if (result.updatedCount > 0 || result.removedCount > 0) {
            const params = currentParamsRef.current;
            if (params.sid) {
                const requestSeq = ++requestSeqRef.current;
                const cached = await loadFromCache(params, requestSeq);
                if (requestSeqRef.current === requestSeq && cached.length > 0) {
                    setChannels(cached);
                }
            }
        }

        logger.info('CHANNEL', '[useChannels] syncFromServer complete', {
            data: { since, syncedAt: result.syncedAt, updated: result.updatedCount, removed: result.removedCount },
        });
    } catch (error) {
        if (cloudIdRef.current !== cloudId) return;
        setStatus('error', error instanceof Error ? error.message : String(error));
        logger.error('CHANNEL', '[useChannels] syncFromServer failed', { error });
    }
}, [cloudId, isVerified, channelRepository, loadFromCache]);
```

- [ ] **Step 4: Wire sync triggers via `useConnectionRecoverySync`**

기존 이벤트 리스너 useEffect 블록 (`채널/채팅/조인 이벤트에 대한 동기화 트리거`) 아래에 추가:

```typescript
// 포그라운드 복귀 및 WebSocket 재연결 시 channel.sync delta 동기화
const syncFromLocal = useCallback(async () => {
    const params = currentParamsRef.current;
    if (!params.sid) return;
    const requestSeq = ++requestSeqRef.current;
    const cached = await loadFromCache(params, requestSeq);
    if (requestSeqRef.current === requestSeq && cached.length > 0) {
        setChannels(cached);
    }
}, [loadFromCache]);

const triggerSync = useCallback(() => {
    void syncFromServer();
}, [syncFromServer]);

useConnectionRecoverySync(syncFromLocal, triggerSync);
```

- [ ] **Step 5: Trigger initial sync on cloud auth**

기존 `cloudId/place가 변경되고 인증 완료 시 채널 목록 재요청` useEffect를 수정합니다.

기존 코드:

```typescript
useEffect(() => {
    if (!cloudId || !targetPlaceId || !isVerified) return;
    const fetchKey = `${cloudId}:${targetPlaceId}`;
    if (prevFetchKeyRef.current === fetchKey) return;
    prevFetchKeyRef.current = fetchKey;

    const isSwitch = ...;
    const isReentry = ...;

    lastFetchedCloudId = cloudId;
    lastFetchedPlaceId = targetPlaceId;

    currentParamsRef.current = initialParams;

    void fetchChannels({ loading: channelsRef.current.length === 0 }).then(() =>
        fetchChannels({ forceNetwork: true, silent: true })
    );
}, [fetchChannels, cloudId, targetPlaceId, isVerified]);
```

수정:

```typescript
useEffect(() => {
    if (!cloudId || !targetPlaceId || !isVerified) return;
    const fetchKey = `${cloudId}:${targetPlaceId}`;
    if (prevFetchKeyRef.current === fetchKey) return;
    prevFetchKeyRef.current = fetchKey;

    const isCloudSwitch = lastFetchedCloudId !== undefined && lastFetchedCloudId !== cloudId;
    const isPlaceSwitch = lastFetchedPlaceId !== undefined && lastFetchedPlaceId !== targetPlaceId;

    lastFetchedCloudId = cloudId;
    lastFetchedPlaceId = targetPlaceId;
    currentParamsRef.current = initialParams;

    if (isCloudSwitch) {
        // 클라우드 전환: channel.mine으로 빠른 렌더 + channel.sync(since:0)으로 full sync
        useChannelSyncStore.getState().setStatus('idle');
        void fetchChannels({ loading: channelsRef.current.length === 0 }).then(() => {
            void syncFromServer();
        });
    } else if (isPlaceSwitch) {
        // place 전환만: channel.mine으로 즉시 렌더 (sync는 이미 클라우드 레벨에서 유지 중)
        void fetchChannels({ loading: channelsRef.current.length === 0, forceNetwork: true });
    } else {
        // 재진입 (같은 cloud/place로 복귀): 캐시 표시 후 sync로 보정
        void fetchChannels({ loading: channelsRef.current.length === 0 }).then(() => {
            void syncFromServer();
        });
    }
}, [fetchChannels, syncFromServer, cloudId, targetPlaceId, isVerified]);
```

- [ ] **Step 6: Update event listeners to use cache reload instead of network refetch**

기존 이벤트 리스너 useEffect를 수정합니다. 실시간 이벤트는 이미 Repository 레벨에서 IndexedDB를 업데이트하므로, 훅에서는 캐시를 다시 읽어오기만 하면 됩니다:

기존:

```typescript
useEffect(() => {
    const debouncedFetch = debounce(() => fetchChannels({ forceNetwork: true }), 300);

    const unsubs = [
        channelRepository.onChannelCreated(() => void debouncedFetch()),
        channelRepository.onChannelUpdated(() => void debouncedFetch()),
        channelRepository.onChannelDeleted(() => void debouncedFetch()),
        chatRepository.onChatCreated((chat: DomainChat) => { ... }),
        joinRepository.onJoinUpdated((join: DomainJoin) => { ... }),
    ];

    return () => unsubs.forEach(fn => fn());
}, [channelRepository, chatRepository, joinRepository, fetchChannels]);
```

수정:

```typescript
useEffect(() => {
    const reloadFromCache = debounce(async () => {
        const params = currentParamsRef.current;
        if (!params.sid) return;
        const requestSeq = ++requestSeqRef.current;
        const cached = await loadFromCache(params, requestSeq);
        if (requestSeqRef.current === requestSeq) {
            setChannels(cached);
        }
    }, 200);

    const unsubs = [
        channelRepository.onChannelCreated(() => void reloadFromCache()),
        channelRepository.onChannelUpdated(() => void reloadFromCache()),
        channelRepository.onChannelDeleted(() => void reloadFromCache()),
        chatRepository.onChatCreated((chat: DomainChat) => {
            if (!chat.channelId || channelsRef.current.length === 0) return;
            if (channelsRef.current.some(ch => ch.id === chat.channelId)) {
                void reloadFromCache();
            }
        }),
        joinRepository.onJoinUpdated((join: DomainJoin) => {
            if (!join.channelId || channelsRef.current.length === 0) return;
            if (channelsRef.current.some(ch => ch.id === join.channelId)) {
                void reloadFromCache();
            }
        }),
    ];

    return () => unsubs.forEach(fn => fn());
}, [channelRepository, chatRepository, joinRepository, loadFromCache]);
```

Note: 실시간 이벤트 시 `channel.mine` network 호출 대신 IndexedDB 캐시 재로드로 변경합니다. Repository의 `initializeInternalListeners()`가 이미 이벤트 수신 시 IndexedDB를 갱신하므로, 훅에서는 캐시만 다시 읽으면 됩니다.

- [ ] **Step 7: Update returned `sync` function**

기존 return에서 `sync` 함수를 수정:

```typescript
return {
    channels,
    isLoading,
    isSyncing,
    isError,
    errorMessage,
    refresh: () => fetchChannels({ forceNetwork: true }),
    sync: () => syncFromServer(),
    debugInfo: fullDebugInfo,
};
```

- [ ] **Step 8: Verify TypeScript compiles and app runs**

Run: `npx nx run web:build --skip-nx-cache`
Expected: 빌드 성공

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app/shared/hooks/useChannels.ts
git commit -m "feat(web): refactor useChannels to use channel.sync for delta synchronization

- Remove 15-second polling
- Add channel.sync delta sync on cloud auth, WS reconnect, foreground resume
- Keep channel.mine for place-switch quick render only
- Event listeners now reload from IndexedDB cache instead of network refetch"
```

---

### Task 8: Verify End-to-End Flow

**Files:** None (verification only)

- [ ] **Step 1: Build the entire workspace**

Run: `npx nx run web:build --skip-nx-cache`
Expected: 빌드 성공, 타입 에러 없음

- [ ] **Step 2: Check for import cycles or missing exports**

Run: `npx nx run data:build --skip-nx-cache && npx nx run socket:build --skip-nx-cache`
Expected: 빌드 성공

- [ ] **Step 3: Verify `@chatic/data` exports include new types**

`libs/data/src/index.ts` (또는 해당 barrel export 파일)에서 `ChannelSyncResult`가 자동으로 re-export 되는지 확인. `events/types.ts` → `events/common.ts`를 통해 `export * from './common'`로 이미 re-export 될 것으로 예상.

- [ ] **Step 4: Commit final verification (if any fixups needed)**

```bash
git add -A
git commit -m "fix: resolve any build issues from channel sync integration"
```
