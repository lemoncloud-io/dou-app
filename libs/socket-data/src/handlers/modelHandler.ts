import { notifyAppUpdated } from '../sync-events';
import type { WSSEnvelope, WSSModelActionType } from '@lemoncloud/chatic-sockets-api';

/**
 * modelHandler
 * model 액션관련 소켓 수신
 * TODO: model 관련 이벤트 방출 업데이트 필요
 * @param envelope 소켓 응답 페이로드
 * @param cloudId
 * @param chatRepo
 * @param channelRepo
 * @author raine@lemoncloud.io
 */
export const modelHandler = async (envelope: WSSEnvelope, cloudId: string, chatRepo: any, channelRepo: any) => {
    const action = envelope.action as WSSModelActionType;
    const { payload, meta, mid } = envelope;
    const channelId = payload?.channelId ?? meta?.channel;

    switch (action) {
        case 'create':
        case 'delete': {
            if (payload?.sourceType === 'join' && channelId) {
                const isEntry = action === 'create' && (payload?.joined ?? 0) >= 1;
                const sysId = mid ?? String(Date.now());
                await chatRepo.saveChat(sysId, {
                    id: sysId,
                    channelId,
                    content: `${payload?.nick ?? '알 수 없음'}님이 ${isEntry ? '들어왔습니다.' : '나갔습니다.'}`,
                    createdAt: Date.now(),
                    ownerId: 'system',
                    stereo: 'system',
                });
                notifyAppUpdated({ domain: 'chat', action, cid: cloudId, targetId: channelId, payload });
            } else if (action === 'create' && (!payload?.sourceType || payload?.sourceType === 'chat')) {
                if (payload.id) {
                    await chatRepo.saveChat(payload.id, payload);
                    notifyAppUpdated({ domain: 'chat', action, cid: cloudId, targetId: channelId, payload });
                }
            }
            break;
        }
        case 'update': {
            if (payload?.reason === 'channel-deleted' && channelId) {
                await channelRepo.deleteChannel(channelId);
                notifyAppUpdated({ domain: 'channel', action, cid: cloudId, targetId: channelId, payload });
            }
            break;
        }
        default:
            console.warn(`[Model Handler] Unhandled model action: ${action}`);
            break;
    }
};
