import { useEffect } from 'react';
import { useWebSocketV2Store } from '@chatic/socket';
import { useJoinRepository } from '../repository';
import type { JoinView } from '@lemoncloud/chatic-socials-api';

/**
 * 채널 참여 정보 및 읽음 커서(ReadNo) 관련 웹소켓 메시지를 수신하여
 * Join 도메인의 로컬 DB를 동기화하는 훅
 */
export const useJoinCacheSync = () => {
    const joinRepository = useJoinRepository();

    useEffect(() => {
        const handleSyncMessage = async (envelope: any) => {
            if (!envelope || envelope.type !== 'chat') return;

            // 현재 앱이 바라보는 클라우드 환경과 패킷의 타겟 환경이 일치하는지 검증
            const cloudId = useWebSocketV2Store.getState().cloudId;
            if (!cloudId || joinRepository.cloudId !== cloudId) return;

            const { action, payload, data } = envelope as any;
            let isDbUpdated = false;
            let targetChannelId = payload?.channelId;

            /**
             * 누군가(혹은 내가) 채팅을 읽어 'read' 액션이 발생했을 때
             * 추출된 최신 참여 정보(업데이트된 chatNo 읽음 커서 등)를 로컬 DB에 덮어쓰기
             * 어떤 채널의 읽음 상태가 갱신되었는지 UI 훅에게 알려주기 위해 ID를 확보
             */
            if (action === 'read') {
                const joinView: JoinView = payload?.joinView || data || payload;
                if (joinView && joinView.id) {
                    await joinRepository.saveJoin(joinView.id, joinView);
                    isDbUpdated = true;
                    targetChannelId = targetChannelId || joinView.channelId;
                }
            }

            if (isDbUpdated && targetChannelId) {
                notifyJoinDbUpdated({
                    domain: 'join',
                    cid: cloudId,
                    targetChannelId: targetChannelId,
                });
            }
        };

        const unsubscribe = useWebSocketV2Store.subscribe(state => state.lastMessage, handleSyncMessage);
        return () => unsubscribe();
    }, [joinRepository]);
};

/**
 * 로컬 DB가 갱신되었음을 현재 브라우저 탭(CustomEvent)과
 * 다른 브라우저 탭(BroadcastChannel)의 모든 UI 컴포넌트에게 알리는 유틸리티 함수
 */
export const notifyJoinDbUpdated = (detail: { domain: 'join'; cid: string; targetChannelId: string }) => {
    window.dispatchEvent(new CustomEvent('local-db-updated', { detail }));
    const bc = new BroadcastChannel('app-db-sync');
    bc.postMessage(detail);
    bc.close();
};
