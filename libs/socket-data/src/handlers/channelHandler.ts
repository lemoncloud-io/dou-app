import type { WSSChannelActionType, WSSEnvelope } from '@lemoncloud/chatic-sockets-api';
import { notifyAppUpdated } from '../sync-events';

/**
 * channelHandler
 * channel 액션관련 소켓 수신
 * TODO: model 관련 이벤트 방출 추가 필요
 * @param envelope 소켓 응답 페이로드
 * @author raine@lemoncloud.io
 */
export const channelHandler = async (envelope: WSSEnvelope, cid: string) => {
    const action = envelope.action as WSSChannelActionType;
    const { payload } = envelope;

    switch (action) {
        /**
         * subscribe - join channels (웹소켓 채널 입장 성공)
         */
        case 'subscribe': {
            const subscribedChannels = payload?.subscribed || [];
            console.log(`[Channel Handler] Successfully subscribed to:`, subscribedChannels);
            notifyAppUpdated({ domain: 'system', action, cid, payload });
            break;
        }

        /**
         * unsubscribe - leave channels (웹소켓 채널 퇴장 성공)
         */
        case 'unsubscribe': {
            const unsubscribedChannels = payload?.unsubscribed || [];
            console.log(`[Channel Handler] Successfully unsubscribed from:`, unsubscribedChannels);
            notifyAppUpdated({ domain: 'system', action, cid, payload });
            break;
        }

        default:
            console.warn(`[Channel Handler] Unhandled channel action: ${action}`);
            break;
    }
};
