import type { ChatErrorPayload, WSSChatActionType, WSSEnvelope } from '@lemoncloud/chatic-sockets-api';
import type { ChannelView, ChatFeedResult, ChatView, JoinView, UserView } from '@lemoncloud/chatic-socials-api';
import type { SocketContext } from '../dispatchers';
import type { ListResult, SocketEventMap } from '../../../events/types';
import type { IEventBus } from '../../../events/eventBus';

/**
 * 수신된 채팅 관련 메시지를 분석하여 채팅, 채널, 사용자 도메인으로 이벤트를 분기합니다.
 * @param envelope 서버로부터 전달받은 원본 메시지 객체
 * @param ctx 현재 소켓 연결의 문맥 정보
 * @param eventBus 시스템 전역 이벤트를 중계하는 인터페이스
 */
export const chatHandler = (envelope: WSSEnvelope, ctx: SocketContext, eventBus: IEventBus<SocketEventMap>) => {
    const action = envelope.action as WSSChatActionType;
    const { payload, meta } = envelope;

    /**
     * - 이벤트 상세 객체 구성
     */
    const detail = {
        cid: ctx.cloudId,
        ref: meta?.ref,
        payload,
    };

    /**
     * - 서버로부터 명시적인 에러 액션이 수신되었거나 페이로드 내에 에러 속성이 포함된 경우 에러를 발생시킵니다.
     */
    if (action === 'error' || payload?.error) {
        eventBus.emit('chat:error', {
            ...detail,
            payload: payload as ChatErrorPayload,
            error: payload?.error || 'Unknown Chat Error',
        });
        return;
    }

    switch (action) {
        // 채팅 메시지 전송 및 생성 처리
        case 'send':
            eventBus.emit('chat:create', { ...detail, payload: payload as ChatView });
            break;

        // 채팅 피드 데이터 조회 결과 처리 (메시지 목록 및 페이징 정보)
        case 'feed':
            eventBus.emit('chat:feed', { ...detail, payload: payload as ChatFeedResult });
            break;

        // 채팅 읽음 상태 갱신 처리
        case 'read':
            eventBus.emit('chat:read', { ...detail, payload: payload as JoinView });
            break;

        // 채팅방 참여 정보(Join) 업데이트
        case 'update-join':
            eventBus.emit('join:update', { ...detail, payload: payload as JoinView });
            break;

        // 사용자의 참여 채널 목록 조회 처리
        case 'mine':
            eventBus.emit('channel:read', { ...detail, payload: payload as ListResult<ChannelView> });
            break;

        // 새로운 채팅방 또는 채널 생성 처리
        case 'start':
            eventBus.emit('channel:create', { ...detail, payload: payload as ChannelView });
            break;

        // 채널 정보 변경 관련 처리 (초대, 퇴장, 속성 변경 등)
        case 'invite':
        case 'leave':
        case 'update-channel':
            eventBus.emit('channel:update', { ...detail, payload: payload as ChannelView });
            break;

        // 채널 삭제 요청 처리
        case 'delete-channel':
            eventBus.emit('channel:delete', { ...detail, payload: payload as ChannelView });
            break;

        // 채널 내 참여 사용자 목록 조회 결과 처리
        case 'users':
            eventBus.emit('user:read', { ...detail, payload: payload as ListResult<UserView> });
            break;

        default:
            console.warn(`[Chat Handler] Unhandled chat action: ${action}`);
            break;
    }
};
