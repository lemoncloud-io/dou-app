# Chat Sync Scheduler

## 문제

현재 `ChatSyncPlan`은 `ctx.client.request('chat.feed')`를 사용하여 네트워크 레이어에서 직접 서버와 통신한다.
이 방식은 **인증 파이프라인(`emitAuthenticated`)을 우회**하므로 인증 처리가 불가능하다.

```
현재 (문제): ChatSyncPlan → ctx.client.request('chat.feed') → raw ClientSocketV2.request() → 인증 없음
필요한 경로: chatRepository.fetchChat() → wssClient.send() → emitAuthenticated() → 인증 완료
```

## 스펙 요구사항

```
1. Client 생성해서 접속 시작
2. 채널의 상태 조회하기; chatNo 조회
3. 캐싱과 서버 간 채팅 동기화 시작
   - 가져올 채팅이 많을 때 → 스케줄러가 자율 조절
4. 동기화 시간 소요 → 캐싱 저장 → 화면 업데이트
   - 주의: 브라우저 타이머는 비활성 탭에서 스로틀됨
   - 체크: 채팅 항목 상태 관리 필요
```

## 해결 방향

**애플리케이션 레이어**에서 `chatRepository.fetchChat()`를 사용하는 sync 스케줄러를 만든다.
`chatRepository.fetchChat()`는 이미 `emitAuthenticated`를 경유하므로 인증 문제가 해결된다.

핵심 설계 원칙:

- **채널별 상태 관리**: 각 채널의 sync 상태(`pending | syncing | synced | error`)를 Zustand로 추적
- **채팅방 진입 시 상태 표시**: 동기화 중인 채널에 진입하면 "동기화 중" UI 표시, sync 완료되면 자동 해제
- **limit=200**: 적절한 페이지 크기로 라운드트립 줄이면서 응답 크기 부담 최소화
- **가시성 감지**: `document.visibilityState`로 백그라운드 탭 감지 → pause/resume

## 아키텍처

```
                    ┌─────────────────────────────┐
                    │      ChatSyncScheduler      │
                    │                             │
useChannels() ─────→│  queue: [ch1, ch2, ch3]     │
                    │                             │
                    │  loop:                      │
                    │    dequeue → syncOne()      │──→ chatRepository.fetchChat()
                    │    → 캐시 저장 → UI 반영     │      (emitAuthenticated 경유)
                    │                             │
visibilitychange ──→│  pause() / resume()         │
                    │                             │
                    └────────────┬────────────────┘
                                 │ onStateChange
                                 ▼
                    ┌─────────────────────────────┐
                    │   useChatSyncStore (Zustand) │
                    │                             │
                    │  states: {                  │
                    │    ch1: 'synced',            │
                    │    ch2: 'syncing',           │
                    │    ch3: 'pending',           │
                    │  }                          │
                    └────────────┬────────────────┘
                                 │ subscribe
                                 ▼
                    ┌─────────────────────────────┐
                    │   CreateChannel UI               │
                    │                             │
                    │   status === 'syncing'      │
                    │     → "동기화 중..." 표시     │
                    │   status === 'synced'        │
                    │     → 일반 표시              │
                    └─────────────────────────────┘
```

## 상세 설계

### 1. 채널별 Sync 상태 Store

```typescript
// useChatSyncStore.ts

type ChannelSyncStatus = 'pending' | 'syncing' | 'synced' | 'error';

interface ChannelSyncState {
    status: ChannelSyncStatus;
    serverChatNo: number;
    localMaxChatNo: number;
    fetchedCount: number; // 이번 sync에서 가져온 메시지 수
    totalGap: number; // 최초 감지된 gap 크기
}

interface ChatSyncStoreState {
    states: Record<string, ChannelSyncState>; // channelId → state
    setChannelState: (channelId: string, state: Partial<ChannelSyncState>) => void;
    getChannelStatus: (channelId: string) => ChannelSyncStatus;
    reset: () => void;
}
```

채팅방 UI에서 사용:

```typescript
// 채팅방 컴포넌트
const syncStatus = useChatSyncStore(s => s.getChannelStatus(channelId));
// 'syncing' → "동기화 중..." 배너 표시
// 'synced' → 숨김
// 'error' → "동기화 실패" 표시
```

### 2. ChatSyncScheduler (순수 클래스)

React 외부 순수 클래스. hook은 lifecycle만 관리.

```typescript
interface SyncTarget {
    channelId: string;
    serverChatNo: number;
}

class ChatSyncScheduler {
    private queue: SyncTarget[] = [];
    private states: Map<string, ChannelSyncState> = new Map();
    private abortController: AbortController | null = null;
    private isPaused = false;
    private isRunning = false;

    constructor(
        private chatRepository: IChatRepository,
        private onStateChange: (channelId: string, state: ChannelSyncState) => void
    ) {}

    enqueue(targets: SyncTarget[]): void;
    start(): void;
    stop(): void;
    pause(): void;
    resume(): void;
    getState(channelId: string): ChannelSyncState | undefined;
}
```

### 3. Sync 로직 (limit=200)

```typescript
private async syncOne(target: SyncTarget, signal: AbortSignal): Promise<void> {
    const { channelId, serverChatNo } = target;
    let localMax = await this.getLocalMaxChatNo(channelId);
    const totalGap = serverChatNo - localMax;

    if (totalGap <= 0) {
        this.updateState(channelId, { status: 'synced' });
        return;
    }

    this.updateState(channelId, {
        status: 'syncing',
        totalGap,
        localMaxChatNo: localMax,
        serverChatNo,
        fetchedCount: 0,
    });

    // gap 크기에 따라 페이지 간 딜레이 결정
    const delayMs = totalGap <= 200 ? 0 : totalGap <= 500 ? 200 : 500;

    let cursorNo: number | undefined = undefined;
    let fetchedCount = 0;

    while (!signal.aborted) {
        const result = await this.chatRepository.fetchChat(
            { channelId, limit: 200, ...(cursorNo ? { cursorNo } : {}) },
            { cachePolicy: 'network-only' }
        );

        fetchedCount += result.list.length;
        this.updateState(channelId, { fetchedCount });

        if (result.list.length === 0) break;

        cursorNo = result.meta?.cursorNo;
        if (!cursorNo || cursorNo === 0) break;

        // 로컬 캐시가 서버에 도달했는지 확인
        localMax = await this.getLocalMaxChatNo(channelId);
        if (localMax >= serverChatNo) break;

        // 페이스 조절
        if (delayMs > 0) {
            await this.delay(delayMs, signal);
        }
    }

    if (!signal.aborted) {
        this.updateState(channelId, {
            status: 'synced',
            localMaxChatNo: localMax,
            fetchedCount,
        });
    }
}
```

### 4. 메인 루프

```typescript
private async runLoop(): Promise<void> {
    this.isRunning = true;

    while (this.queue.length > 0) {
        // 백그라운드 탭 → 대기
        if (this.isPaused) {
            await this.waitForResume();
        }

        const target = this.queue.shift();
        if (!target) break;

        // 이미 synced면 skip
        const state = this.states.get(target.channelId);
        if (state?.status === 'synced') continue;

        this.abortController = new AbortController();

        try {
            await this.syncOne(target, this.abortController.signal);
        } catch (error) {
            if (!(error instanceof DOMException && error.name === 'AbortError')) {
                this.updateState(target.channelId, { status: 'error' });
            }
        }
    }

    this.isRunning = false;
}
```

### 5. 브라우저 가시성 처리

```typescript
// pause: 현재 요청은 완료, 다음 페이지부터 대기
pause(): void {
    this.isPaused = true;
}

// resume: 대기 해제 → 루프 재개
resume(): void {
    this.isPaused = false;
    this.resumeResolver?.();  // waitForResume() Promise 해제
}

private waitForResume(): Promise<void> {
    return new Promise(resolve => {
        this.resumeResolver = resolve;
    });
}
```

비활성 탭에서 `setTimeout`이 스로틀되더라도 pause 상태이므로 타이머 의존 없음.
포그라운드 복귀 시 즉시 재개.

### 6. React 연동: useChatSync hook

```typescript
export const useChatSync = (channels: SyncableChannel[]) => {
    const { chat: chatRepository } = useRepositories();
    const isVerified = useWebSocketV2Store(s => s.isVerified);
    const { setChannelState, reset } = useChatSyncStore();
    const schedulerRef = useRef<ChatSyncScheduler | null>(null);

    // 스케줄러 인스턴스 생성
    useEffect(() => {
        const scheduler = new ChatSyncScheduler(chatRepository, (channelId, state) =>
            setChannelState(channelId, state)
        );
        schedulerRef.current = scheduler;
        return () => {
            scheduler.stop();
            reset();
        };
    }, [chatRepository]);

    // 채널 리스트 → 큐 등록 + 시작
    useEffect(() => {
        const scheduler = schedulerRef.current;
        if (!scheduler || !isVerified || channels.length === 0) return;

        const targets = channels
            .filter(ch => ch.id && (ch.lastChat$?.chatNo ?? ch.chatNo ?? 0) > 0)
            .map(ch => ({
                channelId: ch.id!,
                serverChatNo: ch.lastChat$?.chatNo ?? ch.chatNo ?? 0,
            }));

        scheduler.enqueue(targets);
        scheduler.start();

        return () => scheduler.stop();
    }, [channels, isVerified]);

    // 브라우저 가시성
    useEffect(() => {
        const handler = () => {
            const scheduler = schedulerRef.current;
            if (!scheduler) return;
            document.visibilityState === 'hidden' ? scheduler.pause() : scheduler.resume();
        };
        document.addEventListener('visibilitychange', handler);
        return () => document.removeEventListener('visibilitychange', handler);
    }, []);
};
```

### 7. 채팅방에서 동기화 상태 표시

```typescript
// CreateChannel 컴포넌트
const syncStatus = useChatSyncStore(s => s.states[channelId]?.status);
const syncState = useChatSyncStore(s => s.states[channelId]);

return (
    <div>
        {syncStatus === 'syncing' && (
            <SyncBanner
                fetchedCount={syncState.fetchedCount}
                totalGap={syncState.totalGap}
            />
        )}
        {/* 메시지 목록 — sync 중에도 이미 캐시된 메시지는 표시됨 */}
        <MessageList messages={messages} />
    </div>
);
```

**동기화 중 채팅방 진입 시 동작**:

- 이미 캐시된 메시지는 즉시 표시 (subscribeList 스트림)
- "동기화 중..." 배너 표시 (fetchedCount/totalGap으로 진행률 가능)
- 백그라운드에서 sync 계속 진행 → 매 페이지마다 캐시 업데이트 → UI 자동 반영
- sync 완료 → status='synced' → 배너 자동 사라짐

## 데이터 흐름 예시

### 기본 흐름

```
접속 → channel.mine → channels: [ch1(gap=30), ch2(gap=500), ch3(gap=1200)]
  ↓
enqueue([ch1, ch2, ch3])
  ch1: status='pending', ch2: status='pending', ch3: status='pending'
  ↓
start() → runLoop()
  ↓
ch1: status='syncing' → limit=200, 1회 요청 → status='synced'
ch2: status='syncing' → limit=200, 3회 요청 (200ms 간격) → status='synced'
ch3: status='syncing' → limit=200, 6회 요청 (500ms 간격) → status='synced'
```

### 동기화 중 채팅방 진입

```
ch2 syncing 중 (200/500 fetched) → 사용자가 ch2 채팅방 진입
  ↓
CreateChannel UI:
  - 이미 캐시된 200개 메시지 즉시 표시
  - "동기화 중... (200/500)" 배너 표시
  ↓
백그라운드에서 ch2 sync 계속 진행
  - 300개 추가 fetch → 캐시 저장 → subscribeList → UI 자동 업데이트
  ↓
ch2 status='synced' → 배너 사라짐 → 전체 500개 표시
```

### 백그라운드 탭 전환

```
sync 진행 중: ch3(syncing)
탭 비활성화 → pause() → 현재 요청 완료 후 대기
  ↓
탭 복귀 → resume() → 남은 sync 즉시 재개
```

### 재연결

```
sync 진행 중 → 소켓 끊김 → isVerified=false → effect cleanup → scheduler.stop()
  ↓
재연결 → isVerified=true → effect 재실행
  → channels의 gap 재계산 (이미 캐시된 부분은 localMax에 반영)
  → 남은 gap만 sync
```

## 변경 파일

### 새 파일

| 파일                                                 | 설명                                 |
| ---------------------------------------------------- | ------------------------------------ |
| `apps/web/src/app/shared/sync/ChatSyncScheduler.ts`  | Sync 스케줄러 순수 클래스            |
| `apps/web/src/app/shared/stores/useChatSyncStore.ts` | 채널별 sync 상태 Zustand store       |
| `apps/web/src/app/shared/hooks/useChatSync.ts`       | React hook (스케줄러 lifecycle 관리) |

### 수정 파일

| 파일                        | 변경                                                     |
| --------------------------- | -------------------------------------------------------- |
| `HomePage.tsx`              | `useChatSyncTargets` → `useChatSync` 교체                |
| `WebSocketV2Connection.tsx` | `extraSyncPlans` 등록 제거 (ChatSyncPlan 비활성화)       |
| 채팅방 컴포넌트             | `useChatSyncStore`에서 status 읽어 "동기화 중" 배너 표시 |

### 비활성화 (코드 유지)

| 파일                    | 상태                  |
| ----------------------- | --------------------- |
| `ChatSyncPlan.ts`       | 코드 유지, 사용 안 함 |
| `useChatSyncTargets.ts` | 코드 유지, 사용 안 함 |

## 검증 항목

### 단위 테스트 (ChatSyncScheduler)

| #   | 테스트 케이스             | 검증 내용                                             | 기대 결과                                               |
| --- | ------------------------- | ----------------------------------------------------- | ------------------------------------------------------- |
| 1   | enqueue 기본              | target 등록 시 큐 추가 + pending 상태                 | `queueLength=1`, `status='pending'`                     |
| 2   | enqueue 중복 방지         | 동일 channelId 재등록 시 serverChatNo만 갱신          | `queueLength=1` (증가 없음)                             |
| 3   | enqueue synced skip       | synced 상태 채널 재등록 무시                          | `status='synced'` 유지                                  |
| 4   | 소량 gap sync             | gap ≤ 200 → 1회 fetchChat                             | `fetchChat 1회`, `status='synced'`, `fetchedCount=gap`  |
| 5   | 대량 gap sync             | gap > 200 → 여러 번 fetchChat + cursorNo 페이지네이션 | `fetchChat ≥ 2회`, 전체 메시지 fetch, `status='synced'` |
| 6   | 이미 동기화된 채널        | localMax ≥ serverChatNo                               | `fetchChat 0회`, 즉시 `status='synced'`                 |
| 7   | 다중 채널 순차 처리       | 3개 채널 enqueue → 순서대로 sync                      | 모든 채널 `status='synced'`                             |
| 8   | 에러 격리                 | ch1 fetchChat 에러 → ch2 정상                         | ch1 `status='error'`, ch2 `status='synced'`             |
| 9   | stop 중단                 | sync 진행 중 stop() 호출                              | `running=false`, 추가 fetchChat 없음                    |
| 10  | pause/resume              | pause 중 추가 fetch 없음, resume 후 재개              | pause 동안 fetchChat 증가 없음, resume 후 완료          |
| 11  | 상태 전이 콜백            | onStateChange 호출 순서                               | `pending → syncing → synced` 순서 보장                  |
| 12  | 페이스 조절 (딜레이 없음) | gap ≤ 200                                             | 딜레이 없이 즉시 완료                                   |
| 13  | 페이스 조절 (200ms)       | 200 < gap ≤ 500                                       | 페이지 간 200ms 딜레이                                  |
| 14  | 페이스 조절 (500ms)       | gap > 500                                             | 페이지 간 500ms 딜레이                                  |

### 통합 검증 (수동)

| #   | 시나리오                  | 확인 방법                                  | 기대 결과                                                             |
| --- | ------------------------- | ------------------------------------------ | --------------------------------------------------------------------- |
| 1   | **기본 sync 흐름**        | 접속 → 채널 리스트 로드 → 콘솔 로그 확인   | `[ChatSync] chX synced: fetched=N, gap=M` 로그 출력                   |
| 2   | **상태 전이 확인**        | React DevTools에서 `useChatSyncStore` 관찰 | 각 채널 `pending → syncing → synced` 전이                             |
| 3   | **동기화 중 채팅방 진입** | gap 큰 채널 sync 중 → 해당 채팅방 진입     | "동기화 중" 배너 표시, 캐시된 메시지 즉시 표시, 점진적 업데이트       |
| 4   | **동기화 완료 후 채팅방** | sync 완료된 채널 진입                      | 배너 없음, 전체 메시지 정상 표시                                      |
| 5   | **인증 경유 확인**        | Network/Console에서 메시지 흐름 확인       | `emitAuthenticated` → `isVerified` 대기 후 전송 (auth.update:ok 이후) |
| 6   | **재연결 후 sync**        | 네트워크 끊기 → 재연결                     | `isVerified=true` 후 남은 gap만 sync (캐시된 부분 skip)               |
| 7   | **백그라운드 탭**         | sync 진행 중 탭 전환 → 복귀                | pause → 복귀 후 즉시 재개, 타이머 스로틀 영향 없음                    |
| 8   | **에러 복구**             | 서버 일시 장애 → 복구                      | 실패 채널 `status='error'`, 재연결/리프레시 시 재시도                 |
| 9   | **빈 채널**               | chatNo=0인 채널                            | sync skip, 불필요한 요청 없음                                         |
| 10  | **로컬 캐시 유효**        | 이미 동기화된 채널 재접속                  | fetchChat 호출 없이 즉시 `synced`                                     |

### 성능 검증

| #   | 항목                      | 측정 방법                  | 기준                                            |
| --- | ------------------------- | -------------------------- | ----------------------------------------------- |
| 1   | 소량 gap (≤200) 소요 시간 | 콘솔 타임스탬프            | 1회 요청, 딜레이 없음                           |
| 2   | 중간 gap (500) 소요 시간  | 콘솔 타임스탬프            | 3회 요청 × 200ms = ~1초 이내                    |
| 3   | 대량 gap (1000) 소요 시간 | 콘솔 타임스탬프            | 5회 요청 × 500ms = ~3초 이내                    |
| 4   | UI 반응성                 | sync 중 스크롤/입력 테스트 | UI 블로킹 없음 (비동기 처리)                    |
| 5   | 메모리                    | DevTools Memory 탭         | 채널당 상태 객체만 유지, 메시지는 캐시에만 저장 |

### 엣지 케이스

| #   | 케이스                      | 기대 동작                                          |
| --- | --------------------------- | -------------------------------------------------- |
| 1   | 채널 0개                    | scheduler 시작 안 함                               |
| 2   | 모든 채널 이미 synced       | fetchChat 0회, 즉시 완료                           |
| 3   | sync 중 채널 삭제           | effect cleanup → stop(), abort                     |
| 4   | 클라우드 전환               | effect cleanup → reset() → 새 채널 리스트로 재시작 |
| 5   | 동시 enqueue                | 중복 channelId는 serverChatNo 갱신만, 큐 중복 없음 |
| 6   | fetchChat 응답 list 빈 배열 | 즉시 synced 처리 (무한 루프 방지)                  |
| 7   | cursorNo=0 응답             | 페이지네이션 종료 → synced                         |
| 8   | isVerified=false 상태       | scheduler 시작 안 함 (인증 전 요청 방지)           |

## 장점

1. **인증 보장**: `emitAuthenticated` 경유
2. **전체 sync 보장**: gap 크기 무관, 스케줄러가 끝까지 자율 조절
3. **상태 투명성**: 채널별 sync 상태를 Zustand로 추적 → 어디서든 조회 가능
4. **동기화 중 진입 대응**: "동기화 중" UI 표시, 이미 캐시된 메시지는 즉시 표시, 점진적 업데이트
5. **페이스 자율 조절**: gap 크기 따라 딜레이 자동 결정
6. **백그라운드 탭 안전**: visibilitychange → pause/resume, 타이머 의존 없음
7. **재시작 안전**: abort 후 재실행 시 이미 캐시된 부분 자동 skip
8. **에러 격리**: 한 채널 실패가 다른 채널에 영향 없음
