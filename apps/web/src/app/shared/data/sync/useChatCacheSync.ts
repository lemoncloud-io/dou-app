import { useEffect } from 'react';
import { useWebSocketV2Store } from '@chatic/socket';
import { useChatRepository } from '../repository';
import type { ChatView } from '@lemoncloud/chatic-socials-api';

/**
 * 앱 백그라운드에서 동작하며, 채팅 메시지 수발신 및 시스템 메시지를 수신하여
 * 로컬 IndexedDB(Chat 도메인)와 동기화하고 전역 UI 갱신 이벤트를 방출하는 Sync 데몬 훅입니다.
 */
export const useChatCacheSync = () => {
    const chatRepository = useChatRepository();

    useEffect(() => {
        const handleSyncMessage = async (envelope: any) => {
            if (!envelope || !['chat', 'model'].includes(envelope.type)) return;

            // 현재 앱이 바라보는 클라우드 환경과 패킷의 타겟 환경 일치 여부 검증
            const cloudId = useWebSocketV2Store.getState().cloudId;
            if (!cloudId || chatRepository.cloudId !== cloudId) return;

            const { type, action, payload, meta, mid } = envelope as any;

            // 메시지가 속한 채널 ID 추출 (일반 메시지는 payload, 모델 시스템 메시지는 meta에 존재할 수 있음)
            const channelId = payload?.channelId ?? meta?.channel;
            if (!channelId) return;

            let isDbUpdated = false;

            // 내가 보낸 메시지에 대한 서버의 확정 응답 처리
            if (type === 'chat') {
                if (action === 'send') {
                    // 낙관적 업데이트(Optimistic UI)로 화면에 먼저 띄워둔 '임시 메시지'를 식별자(meta.ref)로 찾아 삭제
                    if (meta?.ref) await chatRepository.deleteChat(meta.ref);

                    // 서버가 부여한 진짜 ID와 생성 시간이 담긴 확정 메시지를 DB에 덮어쓰기
                    if (payload.id) {
                        await chatRepository.saveChat(payload.id, payload as ChatView);
                        isDbUpdated = true;
                    }
                }
            }
            // 타인의 메시지 수신 및 입퇴장 시스템 메시지 생성
            else if (type === 'model') {
                // 누군가 방을 나갔을 때 (퇴장 시스템 메시지 가상 생성)
                if (action === 'delete' && payload?.sourceType === 'join') {
                    // 서버는 이벤트만 주므로, 프론트엔드에서 직접 시스템 메시지 형태를 만들어 DB에 저장필요
                    const sysId = mid ?? String(Date.now());
                    await chatRepository.saveChat(sysId, {
                        id: sysId,
                        channelId,
                        content: `${payload?.nick ?? '알 수 없음'}님이 나갔습니다.`,
                        createdAt: Date.now(),
                        ownerId: 'system',
                        stereo: 'system',
                    } as any);
                    isDbUpdated = true;
                }
                // 누군가 방에 들어왔을 때 (입장 시스템 메시지 가상 생성)
                else if (action === 'create' && payload?.sourceType === 'join') {
                    if ((payload?.joined ?? 0) >= 1) {
                        const sysId = mid ?? String(Date.now());
                        await chatRepository.saveChat(sysId, {
                            id: sysId,
                            channelId,
                            content: `${payload?.nick ?? '알 수 없음'}님이 들어왔습니다.`,
                            createdAt: Date.now(),
                            ownerId: 'system',
                            stereo: 'system',
                        } as any);
                        isDbUpdated = true;
                    }
                }
                // 타인이 보낸 일반 채팅 메시지 수신
                else if (action === 'create' && (!payload?.sourceType || payload?.sourceType === 'chat')) {
                    if (payload.id) {
                        await chatRepository.saveChat(payload.id, payload as ChatView);
                        isDbUpdated = true;
                    }
                }
            }

            if (isDbUpdated) {
                notifyChatDbUpdated({ domain: 'chat', cid: cloudId, targetChannelId: channelId });
            }
        };

        const unsubscribe = useWebSocketV2Store.subscribe(state => state.lastMessage, handleSyncMessage);
        return () => unsubscribe();
    }, [chatRepository]);
};

/**
 * 로컬 DB가 갱신되었음을 현재 브라우저 탭(CustomEvent)과
 * 다른 브라우저 탭(BroadcastChannel)의 모든 UI 컴포넌트에게 알리는 유틸리티 함수
 */
export const notifyChatDbUpdated = (detail: { domain: 'chat'; cid: string; targetChannelId: string }) => {
    window.dispatchEvent(new CustomEvent('local-db-updated', { detail }));
    const bc = new BroadcastChannel('app-db-sync');
    bc.postMessage(detail);
    bc.close();
};
