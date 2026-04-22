import type {
    WSSEnvelope,
    WSSModelActionType,
    ChatErrorPayload,
    ModelSyncPayload,
} from '@lemoncloud/chatic-sockets-api';
import type { SocketContext } from '../dispatchers';
import type { SocketEventMap, SocketEventType } from '../../../events/types';
import type { IEventBus } from '../../../events/eventBus';

/**
 * 수신된 소켓 Envelope 를 해석하여 각 도메인별 이벤트를 발생시킵니다.
 * @param envelope 서버로부터 수신된 원본 메시지 객체
 * @param ctx 현재 소켓의 연결 문맥 정보 (Workspace ID 등)
 * @param eventBus 이벤트를 전파할 시스템 전역 이벤트 버스
 */
export const modelHandler = (envelope: WSSEnvelope, ctx: SocketContext, eventBus: IEventBus<SocketEventMap>) => {
    const { action, payload, meta } = envelope;

    // 데이터 유효성 검사: 전달받은 페이로드가 유효하지 않은 경우 처리 중단
    if (!payload) {
        return;
    }

    /**
     * - 서버의 데이터 전송 최적화 설정(hasCores)에 따라 도메인 식별자의 위치가 결정됩니다.
     * - 데이터 본문이 포함된 경우: payload.type 사용
     * - 식별자 정보만 포함된 경우: payload.sourceType 사용
     */
    const domainType = payload.type || payload.sourceType || 'unknown';

    /**
     * - 공통 이벤트 상세 객체 구성
     */
    const detail = {
        cid: ctx.cloudId,
        ref: meta?.ref,
        payload: payload as ModelSyncPayload,
    };

    /**
     * - 서버로부터 명시적인 에러 액션이 수신되었거나 페이로드 내에 에러 속성이 포함된 경우 에러를 발생시킵니다.
     * - 해당 도메인의 에러 전용 이벤트(예: 'chat:error')를 발행합니다.
     */
    if (action === 'error' || payload.error) {
        const errorEventName = `${domainType}:error` as SocketEventType;

        eventBus.emit(errorEventName, {
            ...detail,
            payload: payload as ChatErrorPayload,
            error: payload.error || 'Unknown Model Error',
        } as any);

        return;
    }

    /**
     * 도메인 속성과 액션 명칭을 조합하여 최종 이벤트 이름을 생성합니다. (예: 'chat:create', 'join:update')
     * 생성(create), 수정(update), 삭제(delete)와 같은 표준 CRUD 액션을 처리합니다.
     */
    const eventName = `${domainType}:${action}` as SocketEventType;

    switch (action as WSSModelActionType) {
        case 'create':
        case 'update':
        case 'delete': {
            eventBus.emit(eventName, detail as any);
            break;
        }
        default:
            console.warn(`[Model Handler] Unhandled user action: ${action}`);
            break;
    }
};
