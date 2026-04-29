import type { ClientSyncPayload, WSSEnvelope, WSSSyncActionType } from '@lemoncloud/chatic-sockets-api';
import type { SocketContext } from '../dispatchers';
import type { SocketEventMap, SocketEventType } from '../../../events/types';
import type { IEventBus } from '../../../events/eventBus';

/**
 * 수신된 동기화 메시지를 분석하여 읽기 또는 업데이트 이벤트로 변환합니다.
 * @param envelope 서버로부터 수신된 동기화 관련 원본 메시지 객체
 * @param ctx 현재 소켓의 연결 문맥 정보
 * @param eventBus 이벤트를 전파할 시스템 전역 이벤트 버스
 */
export const syncHandler = (envelope: WSSEnvelope, ctx: SocketContext, eventBus: IEventBus<SocketEventMap>) => {
    const action = envelope.action as WSSSyncActionType;
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
     * 액션 유형에 따른 이벤트 명칭 매핑을 수행합니다.
     * 'info' 액션은 데이터 조회를 위한 'read' 이벤트로, 그 외의 액션은 'update' 이벤트로 처리합니다.
     */
    const mappedAction = action === 'info' ? 'read' : 'update';
    const eventName = `sync:${mappedAction}` as SocketEventType;

    eventBus.emit(eventName, { ...detail, payload: payload as ClientSyncPayload });
};
