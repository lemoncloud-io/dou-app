# Chat Sync Reconnect Fix - Design Spec

> **작성일**: 2026-06-08
> **범위**: 소켓 재연결 시 채팅 동기화 gap 해소
> **관련 파일**:
>
> - `apps/web/src/app/components/GlobalChatSync.tsx` — 변경 대상
> - `apps/web/src/app/shared/hooks/useChatSync.ts` — 기존 로직 (변경 없음)
> - `apps/web/src/app/shared/sync/ChatSyncScheduler.ts` — 기존 로직 (변경 없음)
> - `apps/web/src/app/shared/hooks/useConnectionRecoverySync.ts` — 참조 패턴

---

## 1. 문제

### 1.1 증상

모바일 앱에서 백그라운드 → 푸시알림 탭 → 앱 복귀 시, 소켓이 끊겨 있던 구간의 채팅 메시지가 동기화되지 않는다. 채팅방에 진입해도 새 메시지가 아예 표시되지 않는다.

### 1.2 근본 원인

소켓 재연결 완료(isVerified=true) 시점에 **채널 목록을 서버에서 다시 가져오는 로직이 없다**.

타임라인:

```
1. 앱 백그라운드 → 소켓 끊김 → isVerified=false
2. 서버에 새 메시지 도착 (gap 발생)
3. 푸시 탭 → 앱 복귀
4. useForegroundResync.triggerResync() 호출
5. isVerified=false → FOREGROUND_RESYNC_EVENT 발행 안됨
6. GlobalChatSync의 visibilitychange도 isVerified=false → fetchChannel() 스킵
7. 소켓이 나중에 reconnect → isVerified=true
8. channels 배열이 변경되지 않음 (로컬 캐시 = stale chatNo)
9. useChatSync → ChatSyncScheduler에 gap 0으로 등록 → 동기화 스킵
```

두 개의 기존 메커니즘이 이 시나리오를 커버하지 못하는 이유:

| 메커니즘                          | 왜 실패하는가                                         |
| --------------------------------- | ----------------------------------------------------- |
| `GlobalChatSync` visibilitychange | 앱 복귀 시점에 isVerified=false → fetchChannel() 스킵 |
| `useForegroundResync`             | 같은 이유로 FOREGROUND_RESYNC_EVENT 발행 안됨         |

소켓이 재연결된 후에는 아무도 채널 목록을 서버에서 다시 가져오지 않는다.

---

## 2. 해결 방안

### 2.1 변경 내용

`GlobalChatSync.tsx`에 소켓 재연결 감지 로직을 추가한다. `useConnectionRecoverySync.ts`에서 사용하는 것과 동일한 패턴으로 `isConnected`/`isVerified` 상태 변화를 구독한다.

### 2.2 감지 조건

```
isConnected: true → false  (실제 끊김 기록)
isVerified: false → true   (재연결 + 인증 완료)
둘 다 충족시 → fetchChannel(network-only) 호출
```

이 조건은 `useConnectionRecoverySync.ts:29-57`의 패턴과 동일하다. in-session auth 갱신(cloud/place 전환)은 소켓이 끊기지 않으므로 `hadDisconnection=false`로 필터링된다.

### 2.3 수정 후 플로우

```
앱 백그라운드 → 소켓 끊김 (hadDisconnection=true)
  → 서버에 새 메시지 도착
  → 푸시 탭 → 앱 복귀
  → 소켓 재연결 → isVerified: false→true + hadDisconnection=true
  → [NEW] fetchChannel({ sid }, { cachePolicy: 'network-only' })
  → 서버 응답: 채널 목록에 최신 chatNo 포함
  → channelRepository.subscribeList 콜백 → channels state 갱신
  → useChatSync: serverChatNo vs localMax 비교 → gap 감지
  → ChatSyncScheduler.enqueue() + start()
  → syncOne(): network-only로 누락 메시지 fetch
  → LocalDataSource 업데이트 → UI 갱신
```

### 2.4 기존 로직과의 관계

| 기존 로직                 | 변경 여부 | 역할                                   |
| ------------------------- | --------- | -------------------------------------- |
| visibilitychange 핸들러   | 유지      | 소켓 살아있는 상태에서 포그라운드 복귀 |
| useChatSync               | 변경 없음 | channels 변경 → scheduler 구동         |
| ChatSyncScheduler         | 변경 없음 | gap detection → 페이지별 fetch         |
| useForegroundResync       | 변경 없음 | 토큰 갱신 + 이벤트 발행                |
| useConnectionRecoverySync | 변경 없음 | 개별 페이지에서 사용하는 resync 훅     |

---

## 3. 구현 상세

### 3.1 GlobalChatSync.tsx 변경

`useEffect` 하나를 추가한다. `useWebSocketV2Store.subscribe()`로 `isConnected`와 `isVerified`를 구독하여 재연결 완료 시 `fetchChannel(network-only)`를 호출한다.

```typescript
// 소켓 재연결 완료 시 채널 목록 서버 refetch
// 포그라운드 복귀 시점에 소켓이 아직 미연결이면 visibilitychange가 커버하지 못하므로
// isVerified: false→true 전환을 직접 감지
useEffect(() => {
    let prevVerified = useWebSocketV2Store.getState().isVerified;
    let hadDisconnection = false;

    const unsubConnected = useWebSocketV2Store.subscribe(
        s => s.isConnected,
        isConnected => {
            if (!isConnected) {
                hadDisconnection = true;
            }
        }
    );

    const unsubVerified = useWebSocketV2Store.subscribe(
        s => s.isVerified,
        isVerified => {
            if (isVerified && !prevVerified && hadDisconnection) {
                const sid = useWebSocketV2Store.getState().selectedPlaceId || undefined;
                void channelRepository.fetchChannel({ sid }, { cachePolicy: 'network-only' });
            }
            if (isVerified) {
                hadDisconnection = false;
            }
            prevVerified = isVerified;
        }
    );

    return () => {
        unsubConnected();
        unsubVerified();
    };
}, [channelRepository]);
```

### 3.2 변경하지 않는 것

- `useChatSync.ts`: channels 배열이 변경되면 자동으로 enqueue + start → 변경 불필요
- `ChatSyncScheduler.ts`: enqueue()에서 synced 채널이라도 serverChatNo가 증가하면 재등록 → 변경 불필요
- `useForegroundResync.ts`: 기존 역할(토큰 갱신 + 이벤트 발행) 유지
- `useConnectionRecoverySync.ts`: 개별 페이지의 resync 훅으로 별개 역할

---

## 4. 엣지 케이스

### 4.1 visibilitychange와 중복 호출

포그라운드 복귀 시 소켓이 이미 verified인 경우:

- visibilitychange 핸들러 → fetchChannel() 호출
- 재연결 감지 로직 → hadDisconnection이 false이므로 호출 안됨
- 중복 없음

포그라운드 복귀 시 소켓 미연결 → 나중에 재연결:

- visibilitychange → isVerified=false → 스킵
- 재연결 감지 → hadDisconnection=true + isVerified=true → fetchChannel() 호출
- 정상 동작

### 4.2 빠른 재연결 (5초 미만 끊김)

소켓이 빠르게 재연결되어도 hadDisconnection=true이면 fetchChannel() 호출된다.
ChatSyncScheduler.enqueue()에서 gap이 0이면 synced로 즉시 마킹하므로 불필요한 fetch는 발생하지 않는다.

### 4.3 place 전환 중 재연결

place 전환은 소켓 끊김 없이 이루어지므로 hadDisconnection=false → 재연결 로직 미동작.
기존 selectedPlaceId 변경 → subscribeList 재생성 로직이 처리한다.

---

## 5. 검증 방법

1. 모바일 앱에서 채팅방 진입 → 메시지 확인
2. 앱 백그라운드로 전환
3. 다른 기기에서 해당 채팅방에 메시지 전송
4. 푸시알림 수신 → 탭하여 앱 복귀
5. 채팅방에 새 메시지가 표시되는지 확인

로그 확인 포인트:

- `[ChatSync] enqueue: added=N` — 재연결 후 채널이 enqueue되는지
- `[ChatSync] {channelId} — syncing start: gap=N` — gap이 감지되는지
- `[ChatSync] {channelId} — synced: fetched=N` — 메시지가 fetch되는지
