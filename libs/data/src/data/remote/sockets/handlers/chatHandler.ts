import type { ChatErrorPayload, WSSChatActionType, WSSEnvelope } from '@lemoncloud/chatic-sockets-api';
import type {
    ChannelView,
    ChatFeedResult,
    ChatView,
    JoinView,
    SiteProfileSyncView,
    UserView,
} from '@lemoncloud/chatic-socials-api';
import type { ChannelSyncView } from '../../events/common';
import { logger } from '@chatic/bridges';
import type { ListResult, SocketEventMap } from '../../../events/types';
import type { IEventBus } from '../../../events/eventBus';

/**
 * 수신된 채팅 관련 메시지를 분석하여 채팅, 채널, 사용자 도메인으로 이벤트를 분기합니다.
 * @param envelope 서버로부터 전달받은 원본 메시지 객체
 * @param eventBus 시스템 전역 이벤트를 중계하는 인터페이스
 */
export const chatHandler = (envelope: WSSEnvelope, eventBus: IEventBus<SocketEventMap>) => {
    const action = envelope.action as WSSChatActionType;
    const { payload, meta } = envelope;

    /**
     * - 이벤트 상세 객체 구성
     */
    const detail = {
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

    /**
     * - 서버가 거부한 요청(예: invite/update-join 권한 거부, parentId 미해결)은
     *   에러 메시지가 벗겨진 data:null 프레임으로 돌아온다. null을 도메인 이벤트로
     *   fan-out하면 리스너들이 일괄 크래시하고, 대기 중인 ref는 null로 "성공"
     *   resolve된다 — 에러로 돌려 ref를 reject시키고 전파를 차단한다.
     */
    if (!payload) {
        eventBus.emit('chat:error', {
            ...detail,
            payload: payload as ChatErrorPayload,
            error: `Empty ${action} payload`,
        });
        return;
    }

    switch (action) {
        // 채팅 메시지 전송 및 생성 처리
        case 'send': {
            const chatView = payload as ChatView;
            // id 없는 응답이 ref를 "성공" resolve하면 낙관행 교체가 조용히 no-op
            // 되어 메시지가 isPending에 고착된다(null은 위에서 차단됨) — 에러로
            // 돌려 기존 isFailed+Retry 계약을 태운다.
            if (!chatView.id) {
                eventBus.emit('chat:error', {
                    ...detail,
                    payload: payload as ChatErrorPayload,
                    error: 'Invalid chat:send payload',
                });
                break;
            }
            eventBus.emit('chat:create', { ...detail, payload: chatView });
            // 채팅 전송 응답에 포함된 channel$ (lastChat$ 등이 갱신된 채널 정보)로 채널 캐시 즉시 업데이트
            if (chatView.channel$) {
                eventBus.emit('channel:update', { ...detail, payload: chatView.channel$ });
            }
            break;
        }

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

        // 채널 동기화 결과 처리
        case 'sync':
            eventBus.emit('channel:sync', { ...detail, payload: payload as ChannelSyncView });
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

        // 도달 가능한 사용자들의 플레이스 프로필 동기화 delta 처리
        case 'sync-site-profile':
            eventBus.emit('profile:sync', { ...detail, payload: payload as SiteProfileSyncView });
            break;

        default:
            logger.warn('CHAT', `[Chat Handler] Unhandled chat action: ${action}`);
            break;
    }
};
