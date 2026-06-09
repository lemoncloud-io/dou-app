import { useEffect, useRef, useState } from 'react';

import type { DomainChannel } from '@chatic/data';
import { useWebSocketV2Store } from '@chatic/socket';

import { useRepositories } from '../data';
import { useChatSync } from '../hooks/useChatSync';

const MIN_HIDDEN_MS = 5_000;

/**
 * 전역 ChatSync 컴포넌트.
 * App 레벨에서 마운트되어 페이지 이동과 무관하게 동기화를 유지합니다.
 * 채널 캐시를 직접 구독하여 모든 채널의 chatNo gap을 감지합니다.
 */
export const GlobalChatSync = () => {
    const { channel: channelRepository, chat: chatRepository } = useRepositories();
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

    // 소켓 재연결(connected edge) 시 catch-up.
    // AutoReconnectController는 끊김을 투명하게 복구하지만, 토큰이 아직 유효하면
    // isVerified가 true로 유지되고 채널 리스트 객체도 그대로라 useChatSync는 트리거되지
    // 않습니다 → 끊긴 동안 도착한 메시지를 (탭 hide/show나 place 전환 전까지) 놓침.
    // isConnected가 false→true로 바뀌는 경계에서 채널 리스트를 network-only로 refetch해
    // serverChatNo를 갱신하면 useChatSync의 gap 로직이 누락분을 채우고, 오프라인 중
    // 실패한 발신도 함께 flush합니다.
    useEffect(() => {
        let sawDisconnect = false;
        return useWebSocketV2Store.subscribe(
            s => s.isConnected,
            isConnected => {
                if (!isConnected) {
                    sawDisconnect = true;
                    return;
                }
                if (!sawDisconnect) return; // 최초 연결은 초기 로드가 이미 동기화함
                sawDisconnect = false;
                const sid = useWebSocketV2Store.getState().selectedPlaceId || undefined;
                void channelRepository.fetchChannel({ sid }, { cachePolicy: 'network-only' });
                void chatRepository.flushFailedChats();
            }
        );
    }, [channelRepository, chatRepository]);

    useChatSync(channels);

    return null;
};
