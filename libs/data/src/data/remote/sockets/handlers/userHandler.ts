import type { ChatErrorPayload, WSSEnvelope, WSSUserActionType } from '@lemoncloud/chatic-sockets-api';
import type { SiteView, UserView } from '@lemoncloud/chatic-socials-api';
import type { SocketContext } from '../dispatchers';
import type { SocketEventMap } from '../../../events/types';
import type { IEventBus } from '../../../events/eventBus';

/**
 * 사용자 및 사이트 관련 메시지를 분석하여 각각의 도메인 이벤트로 분기 처리합니다.
 * @param envelope 서버로부터 전달받은 사용자 도메인 원본 메시지 객체
 * @param ctx 현재 소켓 연결의 문맥 정보
 * @param eventBus 이벤트를 중계할 전역 이벤트 버스
 */
export const userHandler = (envelope: WSSEnvelope, ctx: SocketContext, eventBus: IEventBus<SocketEventMap>) => {
    const action = envelope.action as WSSUserActionType;
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
        eventBus.emit('user:error', {
            ...detail,
            payload: payload as ChatErrorPayload,
            error: payload?.error || 'Unknown User Error',
        });
        return;
    }

    switch (action) {
        // 사용자가 소속된 사이트 목록 조회 처리
        case 'my-site': {
            eventBus.emit('site:read', { ...detail, payload: payload as { list: SiteView[] } });
            break;
        }
        // 새로운 사이트 생성 결과 처리
        case 'make-site': {
            eventBus.emit('site:create', { ...detail, payload: payload as SiteView });
            break;
        }
        // 기존 사이트 정보 업데이트 처리
        case 'update-site': {
            eventBus.emit('site:update', { ...detail, payload: payload as SiteView });
            break;
        }
        // 사용자 본인의 프로필 정보 수정 처리
        case 'update-profile': {
            eventBus.emit('user:update', { ...detail, payload: payload as UserView });
            break;
        }
        // 타 사용자에 대한 초대 결과 처리
        case 'invite': {
            eventBus.emit('user:create', { ...detail, payload: payload as UserView });
            break;
        }
        default:
            console.warn(`[User Handler] Unhandled user action: ${action}`);
            break;
    }
};
