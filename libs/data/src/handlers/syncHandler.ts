import type { ClientSyncPayload, WSSEnvelope, WSSSyncActionType } from '@lemoncloud/chatic-sockets-api';
import { notifyAppUpdated } from '../sync-events';

/**
 * syncHandler
 * sync 액션관련 소켓 수신
 * TODO: sync 관련 이벤트 방출 필요
 * @param envelope 소켓 응답 페이로드
 * @author raine@lemoncloud.io
 */
export const syncHandler = async (envelope: WSSEnvelope, cid: string) => {
    const action = envelope.action as WSSSyncActionType;
    const payload = envelope.payload as ClientSyncPayload;

    switch (action) {
        /**
         * update, sync:  클라이언트 상태 업데이트 수신
         */
        case 'update':
        case 'sync': {
            if (payload) {
                console.log(`[Sync Handler] State updated:`, payload);
            }
            notifyAppUpdated({ domain: 'presence', action, cid, payload });
            break;
        }

        /**
         * info: 현재 디바이스/상태 정보 조회 응답
         */
        case 'info': {
            if (payload) {
                console.log(`[Sync Handler] Info received:`, payload);
            }
            notifyAppUpdated({ domain: 'presence', action, cid, payload });
            break;
        }

        default:
            console.warn(`[Sync Handler] Unhandled sync action: ${action}`);
            break;
    }
};
