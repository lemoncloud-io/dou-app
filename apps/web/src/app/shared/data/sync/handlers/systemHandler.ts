import type { SystemPayload, WSSEnvelope, WSSSystemActionType } from '@lemoncloud/chatic-sockets-api';
import { notifyAppUpdated } from '../syncEvent';

export const systemHandler = async (envelope: WSSEnvelope, cid: string) => {
    const action = envelope.action as WSSSystemActionType;
    const payload = envelope.payload as SystemPayload;

    switch (action) {
        /**
         * ping / pong
         * 연결 상태 및 헬스 체크
         */
        case 'ping':
        case 'pong': {
            notifyAppUpdated({ domain: 'system', cid, action, payload });
            break;
        }

        /**
         * info
         * 현재 접속된 커넥션 정보 수신
         */
        case 'info': {
            console.log(`[System Handler] Connection info received:`, payload);
            notifyAppUpdated({ domain: 'system', cid, action, payload });
            break;
        }

        /**
         * message
         * 시스템 에코 메시지 또는 공지 메세지
         */
        case 'message': {
            if (payload?.content) {
                console.log(`[System Handler] System message:`, payload.content);
            }
            notifyAppUpdated({ domain: 'system', cid, action, payload });
            break;
        }

        /**
         * error
         * 시스템 레벨 에러 발생
         */
        case 'error': {
            notifyAppUpdated({ domain: 'error', cid, action, payload });
            break;
        }

        default:
            console.warn(`[System Handler] Unhandled system action: ${action}`);
            break;
    }
};
