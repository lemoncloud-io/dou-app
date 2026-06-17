import { useCallback, useEffect, useRef, useState } from 'react';

import type { DomainChannel } from '@chatic/data';

import { useRepositories } from '../data';
import { useChatSync } from '../hooks/useChatSync';
import { useWebSocketV2Store } from '../socket';

const MIN_HIDDEN_MS = 5_000;

/**
 * 전역 ChatSync 컴포넌트.
 * App 레벨에서 마운트되어 페이지 이동과 무관하게 동기화를 유지합니다.
 * 채널 캐시를 직접 구독하여 모든 채널의 chatNo gap을 감지합니다.
 */
export const GlobalChatSync = () => {
    const { channel: channelRepository, chat: chatRepository } = useRepositories();
    const [channels, setChannels] = useState<DomainChannel[]>([]);

    // place/cloud 전환 시 구독을 재생성하여 새 스코프의 채널만 sync 대상에 포함
    // channelRepository.subscribeList()가 호출 시점의 DataContext(cid/sid)를 캡처하므로
    // selectedPlaceId가 변경되면 구독을 재생성해야 새 place의 채널이 반환됨.
    // cloudId도 마찬가지 — 신·구 클라우드의 placeId가 우연히 같으면 재구독이 안
    // 일어나 이전 클라우드 채널이 sync 타겟으로 남고, 새 소켓에 타 클라우드
    // channelId로 catch-up feed를 쏘게 됨(relay 403 not-a-member).
    const selectedPlaceId = useWebSocketV2Store(s => s.selectedPlaceId);
    const cloudId = useWebSocketV2Store(s => s.cloudId);

    useEffect(() => {
        setChannels([]);
        const unsub = channelRepository.subscribeList({}, result => {
            if (result) {
                setChannels(result.list);
            }
        });
        return () => unsub();
    }, [channelRepository, selectedPlaceId, cloudId]);

    // 서버에서 채널 목록을 가져와 channels state에 직접 반영하는 헬퍼
    // subscribeList 콜백에 의존하지 않고 결과를 직접 setChannels로 반영
    const fetchAndApply = useCallback(
        async (cachePolicy: 'cache-only' | 'network-only') => {
            const sid = useWebSocketV2Store.getState().selectedPlaceId || undefined;
            try {
                const result = await channelRepository.fetchChannel({ sid }, { cachePolicy });
                if (result?.list?.length) {
                    setChannels(result.list);
                }
            } catch {
                // 캐시/네트워크 실패 무시
            }
        },
        [channelRepository]
    );

    // 포그라운드 복귀 시 채널 리스트 갱신
    // 1) 캐시에서 즉시 읽어 channels 반영 → useChatSync가 gap 감지
    // 2) 소켓 연결 상태면 서버에서도 가져옴
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

            void fetchAndApply('cache-only');

            const { isVerified } = useWebSocketV2Store.getState();
            if (isVerified) {
                void fetchAndApply('network-only');
            }
        };
        document.addEventListener('visibilitychange', handler);
        return () => document.removeEventListener('visibilitychange', handler);
    }, [fetchAndApply]);

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
                    void fetchAndApply('network-only');
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
    }, [fetchAndApply]);

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
            }
        );
    }, [channelRepository, chatRepository]);

    useChatSync(channels);

    return null;
};
