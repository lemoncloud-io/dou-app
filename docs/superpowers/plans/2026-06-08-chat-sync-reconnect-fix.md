# Chat Sync Reconnect Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix chat message sync gap that occurs when the app returns from background after a socket disconnection — new messages sent during the gap never appear.

**Architecture:** Add a single `useEffect` to `GlobalChatSync.tsx` that subscribes to `useWebSocketV2Store` state changes to detect real socket reconnection (isConnected drop + isVerified recovery). On reconnection, it calls `channelRepository.fetchChannel(network-only)` to get fresh channel data with updated `chatNo` values, which triggers the existing `useChatSync` → `ChatSyncScheduler` pipeline to fill the message gap.

**Tech Stack:** React hooks, Zustand store subscription (`useWebSocketV2Store`), existing `channelRepository` API

**Spec:** `docs/superpowers/specs/2026-06-08-chat-sync-reconnect-fix-design.md`

---

### Task 1: Add socket reconnection detection to GlobalChatSync

**Files:**

- Modify: `apps/web/src/app/components/GlobalChatSync.tsx`

**Context for implementer:**

The file `GlobalChatSync.tsx` is a renderless React component (`return null`) that manages chat synchronization at the app level. It currently has two `useEffect` hooks:

1. One subscribes to local channel cache via `channelRepository.subscribeList()` and feeds channels into `useChatSync()`
2. One listens to `visibilitychange` to refetch channels from server when the tab becomes visible (but only if socket is already `isVerified`)

The bug: when the app goes to background, the socket disconnects. On return, `visibilitychange` fires but the socket hasn't reconnected yet (`isVerified=false`), so the channel refetch is skipped. When the socket later reconnects, nothing triggers a channel refetch, so stale `chatNo` values remain and the sync scheduler thinks there's no gap.

The fix: add a third `useEffect` that subscribes to `useWebSocketV2Store` to detect actual socket reconnections (not in-session auth renewals) and calls `fetchChannel(network-only)`. This pattern is already used in `useConnectionRecoverySync.ts` (lines 29-57).

- [ ] **Step 1: Add the reconnection detection useEffect**

Add the following `useEffect` to `GlobalChatSync.tsx`, after the existing `visibilitychange` effect (line 59) and before the `useChatSync(channels)` call (line 61):

```typescript
// 소켓 재연결 완료 시 채널 목록 서버 refetch
// 포그라운드 복귀 시점에 소켓이 아직 미연결이면 visibilitychange가 커버하지 못하므로
// isVerified: false→true 전환을 직접 감지하여 누락된 메시지 gap을 해소
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

The complete file after modification should be:

```typescript
import { useEffect, useRef, useState } from 'react';

import type { DomainChannel } from '@chatic/data';
import { useWebSocketV2Store } from '@chatic/socket';

import { useRepositories } from '../shared/data';
import { useChatSync } from '../shared/hooks/useChatSync';

const MIN_HIDDEN_MS = 5_000;

/**
 * 전역 ChatSync 컴포넌트.
 * App 레벨에서 마운트되어 페이지 이동과 무관하게 동기화를 유지합니다.
 * 채널 캐시를 직접 구독하여 모든 채널의 chatNo gap을 감지합니다.
 */
export const GlobalChatSync = () => {
    const { channel: channelRepository } = useRepositories();
    const [channels, setChannels] = useState<DomainChannel[]>([]);

    // place 전환 시 구독을 재생성하여 새 place의 채널도 sync 대상에 포함
    // channelRepository.subscribeList()가 호출 시점의 DataContext(sid 포함)를 캡처하므로
    // selectedPlaceId가 변경되면 구독을 재생성해야 새 place의 채널이 반환됨
    const selectedPlaceId = useWebSocketV2Store(s => s.selectedPlaceId);

    useEffect(() => {
        setChannels([]);
        const unsub = channelRepository.subscribeList({}, result => {
            if (result) {
                setChannels(result.list);
            }
        });
        return () => unsub();
    }, [channelRepository, selectedPlaceId]);

    // 포그라운드 복귀 시 현재 place의 채널 리스트를 서버에서 refetch
    // 토큰 refresh chain(foreground-resync)에 의존하지 않고 visibilitychange를 직접 감지
    // → 소켓이 이미 verified 상태이면 즉시 채널만 가져옴
    const hiddenAtRef = useRef<number | null>(null);
    useEffect(() => {
        const handler = () => {
            if (document.visibilityState === 'hidden') {
                hiddenAtRef.current = Date.now();
                return;
            }
            if (document.visibilityState !== 'visible' || !hiddenAtRef.current) return;

            const elapsed = Date.now() - hiddenAtRef.current;
            hiddenAtRef.current = null;
            if (elapsed < MIN_HIDDEN_MS) return;

            const { isVerified } = useWebSocketV2Store.getState();
            if (!isVerified) return;

            const sid = useWebSocketV2Store.getState().selectedPlaceId || undefined;
            void channelRepository.fetchChannel({ sid }, { cachePolicy: 'network-only' });
        };
        document.addEventListener('visibilitychange', handler);
        return () => document.removeEventListener('visibilitychange', handler);
    }, [channelRepository]);

    // 소켓 재연결 완료 시 채널 목록 서버 refetch
    // 포그라운드 복귀 시점에 소켓이 아직 미연결이면 visibilitychange가 커버하지 못하므로
    // isVerified: false→true 전환을 직접 감지하여 누락된 메시지 gap을 해소
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

    useChatSync(channels);

    return null;
};
```

- [ ] **Step 2: Verify the build passes**

Run: `npx nx build web --skip-nx-cache 2>&1 | tail -20`

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 3: Verify lint passes**

Run: `npx nx lint web --skip-nx-cache 2>&1 | tail -20`

Expected: No new lint errors introduced.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/components/GlobalChatSync.tsx
git commit -m "fix(chat-sync): trigger channel refetch on socket reconnection

소켓 재연결 완료(isVerified: false→true) 시 채널 목록을 서버에서
다시 가져오도록 GlobalChatSync에 reconnection detection 추가.
기존 visibilitychange 핸들러가 커버하지 못하는 타이밍 gap 해소.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Verification Checklist

After implementation, verify the fix with the following scenario:

1. 모바일 앱에서 채팅방 진입 → 기존 메시지 확인
2. 앱을 백그라운드로 전환 (홈 버튼)
3. 다른 기기에서 해당 채팅방에 메시지 2-3개 전송
4. 푸시알림 수신 → 탭하여 앱 복귀
5. 채팅방에 새 메시지가 표시되는지 확인

**로그 확인 (개발자 도구 콘솔):**

- `[ChatSync] enqueue: added=N` — 재연결 후 채널이 큐에 등록되는지
- `[ChatSync] {channelId} — syncing start: gap=N` — gap이 0보다 큰지
- `[ChatSync] {channelId} — synced: fetched=N` — 메시지가 실제로 fetch되는지

**엣지 케이스 확인:**

- 소켓이 이미 연결된 상태에서 포그라운드 복귀 → 기존 visibilitychange만 동작, 중복 호출 없음
- place 전환 → hadDisconnection=false이므로 재연결 로직 미동작
