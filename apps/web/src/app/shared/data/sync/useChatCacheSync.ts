import { useEffect } from 'react';
import { useWebSocketV2Store } from '@chatic/socket';
import { createStorageAdapter } from '../local';
import type { JoinView } from '@lemoncloud/chatic-socials-api';

/**
 * 웹소켓의 수신 메시지를 구독하고, 이를 로컬 DB(캐시)와 동기화하는 커스텀 훅입니다.
 */
export const useChatCacheSync = () => {
    useEffect(() => {
        // Zustand 스토어(웹소켓 상태)의 lastMessage 변경 사항을 구독
        const unsubscribe = useWebSocketV2Store.subscribe(
            state => state.lastMessage,
            async envelope => {
                // 수신된 데이터가 없거나, 도메인 타입이 'chat'이 아닌 경우 로직 종료
                if (!envelope || envelope.type !== 'chat') return;

                // 현재 접속 중인 사용자의 클라우드 ID 조회
                const cloudId = useWebSocketV2Store.getState().cloudId;
                if (!cloudId) return; // cloudId가 없으면 스토리지 경로를 특정할 수 없으므로 종료

                const { action, payload, data, meta } = envelope as any;
                const channelId = payload?.channelId;
                if (!channelId) return; // 채널 식별자가 없으면 데이터 처리 불가

                // cloudId 기반의 로컬 스토리지 어댑터(채팅용, 참여정보용) 인스턴스 생성
                const chatDB = createStorageAdapter('chat', cloudId);
                const joinDB = createStorageAdapter('join', cloudId);

                // DB 갱신 여부를 추적하기 위한 상태 플래그
                let isDbUpdated = false;

                // 웹소켓 메시지의 action 타입에 따른 분기 처리
                switch (action) {
                    case 'send': {
                        // 1. 메시지 발송 완료 액션
                        // 발송 전 로컬에 임시 저장했던 메시지(optimistic UI용 등)가 있다면 삭제
                        if (meta?.ref) {
                            await chatDB.delete(meta.ref);
                        }
                        // 서버로부터 확정된 메시지 데이터(payload)를 로컬 DB에 저장
                        if (payload.id) {
                            await chatDB.save(payload.id, payload);
                            isDbUpdated = true;
                        }
                        break;
                    }
                    case 'read': {
                        // 메시지 읽음 처리 액션
                        // 구조에 따라 joinView 데이터를 추출
                        const joinView: JoinView = payload?.joinView || data || payload;

                        // 추출된 읽음 상태(joinView) 정보를 로컬 DB에 갱신
                        if (joinView && joinView.id) {
                            await joinDB.save(joinView.id, joinView);
                            isDbUpdated = true;
                        }
                        break;
                    }
                }

                // DB에 변경 사항이 발생한 경우에만 전역 이벤트 디스패치
                // 이를 통해 UI 컴포넌트들이 로컬 캐시 갱신을 인지하고 리렌더링을 수행할 수 있음
                if (isDbUpdated) {
                    window.dispatchEvent(
                        new CustomEvent('local-db-updated', {
                            detail: { domain: 'chat', cid: cloudId, channelId },
                        })
                    );
                }
            }
        );

        // 컴포넌트 언마운트 시 메모리 누수를 방지하기 위해 구독 해제
        return () => unsubscribe();
    }, []);
};
