import { useCallback, useEffect, useRef } from 'react';

import { logger } from '@chatic/app-messages';
import { useWebSocketV2Store } from '@chatic/socket';

import { useRepositories } from '../data';
import { ChatSyncScheduler } from '../sync/ChatSyncScheduler';
import { useChatSyncStore } from '../stores/useChatSyncStore';

interface SyncableChannel {
    id?: string;
    chatNo?: number;
    lastChat$?: { chatNo?: number };
}

/**
 * 채널 리스트를 받아 각 채널의 serverChatNo vs localMaxChatNo를 비교하고,
 * gap이 있으면 chatRepository.fetchChat()으로 누락된 메시지를 fetch합니다.
 *
 * - 인증 보장: chatRepository → emitAuthenticated 경유
 * - 상태 추적: useChatSyncStore에 채널별 sync 상태 기록
 * - 트리거: channels 변경 또는 isVerified 변경 시 자동 실행
 * - 재연결: isVerified=false → stop → isVerified=true → 재시작
 * - 가시성: 백그라운드 탭 → pause, 포그라운드 → resume
 */
export const useChatSync = (channels: SyncableChannel[]) => {
    const { chat: chatRepository } = useRepositories();
    const isVerified = useWebSocketV2Store(s => s.isVerified);
    const { setChannelState, reset } = useChatSyncStore();
    const schedulerRef = useRef<ChatSyncScheduler | null>(null);

    // 스케줄러 인스턴스 생성
    useEffect(() => {
        logger.info('SYNC', `[ChatSync] hook init — creating scheduler`);
        const scheduler = new ChatSyncScheduler(chatRepository, {
            onStateChange: (channelId, state) => setChannelState(channelId, state),
        });
        schedulerRef.current = scheduler;

        return () => {
            logger.info('SYNC', `[ChatSync] hook cleanup — stopping scheduler, resetting store`);
            scheduler.stop();
            reset();
        };
    }, [chatRepository, setChannelState, reset]);

    // isVerified가 false로 바뀌면 스케줄러 중지
    useEffect(() => {
        if (!isVerified && schedulerRef.current?.running) {
            logger.debug('SYNC', `[ChatSync] isVerified=false → stopping scheduler`);
            schedulerRef.current.stop();
        }
    }, [isVerified]);

    // 채널 리스트 → 큐 등록 + 시작
    // cleanup에서 stop하지 않음 — channels ref가 바뀔 때마다 stop→restart하면
    // in-flight 요청이 중복 발사되고, abort로 인해 'synced' 상태 전환이 누락됨
    useEffect(() => {
        const scheduler = schedulerRef.current;
        if (!scheduler || !isVerified || channels.length === 0) {
            if (!isVerified) {
                logger.debug('SYNC', `[ChatSync] waiting for isVerified (channels=${channels.length})`);
            }
            return;
        }

        const targets = channels
            .filter(ch => ch.id && (ch.lastChat$?.chatNo ?? ch.chatNo ?? 0) > 0)
            .map(ch => ({
                channelId: ch.id!,
                serverChatNo: ch.lastChat$?.chatNo ?? ch.chatNo ?? 0,
            }));

        if (targets.length === 0) {
            logger.debug('SYNC', `[ChatSync] no sync targets (all channels chatNo=0)`);
            return;
        }

        logger.info('SYNC', `[ChatSync] channels ready — targets=${targets.length}, isVerified=${isVerified}`);
        scheduler.enqueue(targets);
        scheduler.start();
        // cleanup 없음 — enqueue()는 synced 채널 skip, start()는 isRunning이면 no-op
        // unmount 시 정리는 스케줄러 생성 effect의 cleanup에서 처리
    }, [channels, isVerified]);

    // 브라우저 가시성 처리
    useEffect(() => {
        const handler = () => {
            const scheduler = schedulerRef.current;
            if (!scheduler) return;
            if (document.visibilityState === 'hidden') {
                logger.debug('SYNC', `[ChatSync] tab hidden → pause`);
                scheduler.pause();
            } else {
                logger.debug('SYNC', `[ChatSync] tab visible → resume`);
                scheduler.resume();
            }
        };
        document.addEventListener('visibilitychange', handler);
        return () => document.removeEventListener('visibilitychange', handler);
    }, []);

    // 채널 상태 조회 유틸
    const getChannelSyncStatus = useCallback(
        (channelId: string) => useChatSyncStore.getState().getChannelStatus(channelId),
        []
    );

    return { getChannelSyncStatus };
};
