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
