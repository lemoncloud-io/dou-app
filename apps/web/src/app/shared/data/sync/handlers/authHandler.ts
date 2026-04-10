import type { AuthPayload, WSSAuthActionType, WSSEnvelope } from '@lemoncloud/chatic-sockets-api';
import { notifyAppUpdated } from '../syncEvent';

/**
 * authHandler
 * auth 액션관련 소켓 수신 및 전역 상태 이벤트 방출
 * @param envelope 소켓 응답 페이로드
 * @param cid
 * @author raine@lemoncloud.io
 */
export const authHandler = async (envelope: WSSEnvelope, cid: string) => {
    const action = envelope.action as WSSAuthActionType;
    const payload = envelope.payload as AuthPayload;

    switch (action) {
        /**
         * 서버로부터 인증 상태 동기화 응답 수신
         */
        case 'update': {
            if (payload.error) {
                notifyAppUpdated({ domain: 'error', cid, action, payload });
                break;
            }
            notifyAppUpdated({ domain: 'auth', action, cid, payload });
            break;
        }

        default:
            console.warn(`[Auth Handler] Unhandled auth action: ${action}`);
            break;
    }
};
