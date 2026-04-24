import type { SystemPayload, WSSEnvelope, WSSSystemActionType, ChatErrorPayload } from '@lemoncloud/chatic-sockets-api';
import type { SocketContext } from '../dispatchers';
import type { SocketEventMap, SocketEventType } from '../../../events/types';
import type { IEventBus } from '../../../events/eventBus';

/**
 * 시스템 관련 소켓 메시지를 분석하여 해당 액션에 부합하는 이벤트를 발생시킵니다.
 * @param envelope 서버로부터 수신된 시스템 원본 메시지 객체
 * @param ctx 소켓 연결 문맥 정보 (Workspace ID 등)
 * @param eventBus 이벤트를 중계할 전역 이벤트 버스
 */
export const systemHandler = (envelope: WSSEnvelope, ctx: SocketContext, eventBus: IEventBus<SocketEventMap>) => {
    const action = envelope.action as WSSSystemActionType;
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
    if (action === 'error' || (payload as any)?.error) {
        eventBus.emit('system:error', {
            ...detail,
            payload: payload as SystemPayload | ChatErrorPayload,
            error: (payload as any)?.error || 'Unknown System Error',
        });
        return;
    }

    /**
     * 시스템 액션 라우팅
     * 'ping', 'info' 등의 액션 명칭을 조합하여 시스템 도메인 이벤트를 동적으로 생성하고 전파합니다.
     */
    const eventName = `system:${action}` as SocketEventType;
    eventBus.emit(eventName, { ...detail, payload: payload as SystemPayload });
};
