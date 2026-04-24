import type { AuthPayload, ChatErrorPayload, WSSAuthActionType, WSSEnvelope } from '@lemoncloud/chatic-sockets-api';
import type { SocketContext } from '../dispatchers';
import type { IEventBus } from '../../../events/eventBus';
import type { SocketEventMap } from '../../../events/types';

/**
 * 인증 관련 소켓 메시지를 분석하여 적절한 인증 이벤트를 발생시킵니다.
 * @param envelope 서버로부터 전달받은 인증 관련 메시지 객체
 * @param ctx 현재 소켓 연결의 문맥 정보 (cloud id 등)
 * @param eventBus 시스템 전역에서 사용하는 이벤트 중계 인터페이스
 */
export const authHandler = (envelope: WSSEnvelope, ctx: SocketContext, eventBus: IEventBus<SocketEventMap>) => {
    const action = envelope.action as WSSAuthActionType;
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
    if ((payload as any)?.error) {
        eventBus.emit('auth:error', {
            ...detail,
            payload: payload as AuthPayload | ChatErrorPayload,
            error: (payload as any)?.error || 'Unknown Auth Error',
        });
        return;
    }

    switch (action) {
        // 인증 성공 또는 인증 정보 갱신
        case 'update':
            eventBus.emit('auth:update', { ...detail, payload: payload as AuthPayload });
            break;

        default:
            console.warn(`[Auth Handler] Unhandled auth action: ${action}`);
            break;
    }
};
