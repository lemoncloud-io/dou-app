import { notifyAppUpdated } from '../syncEvent';
import type { WSSChatActionType, WSSEnvelope } from '@lemoncloud/chatic-sockets-api';
import type { CacheChannelView } from '@chatic/app-messages';

/**
 * chatHandler
 * chat 액션관련 소켓 수신
 * TODO: chat 관련 이벤트 방출 업데이트 필요
 * @param envelope 소켓 응답 페이로드
 * @param cloudId
 * @param placeId
 * @param myUserId
 * @param chatRepo
 * @param channelRepo
 * @param joinRepo
 * @param userRepo
 * @author raine@lemoncloud.io
 */
export const chatHandler = async (
    envelope: WSSEnvelope,
    cloudId: string,
    placeId: string,
    myUserId: string,
    chatRepo: any,
    channelRepo: any,
    joinRepo: any,
    userRepo: any
) => {
    const action = envelope.action as WSSChatActionType;
    const { payload, meta } = envelope;

    const channelId = payload?.channelId ?? meta?.channel;

    switch (action) {
        case 'send': {
            if (meta?.ref) await chatRepo.deleteChat(meta?.ref);
            if (payload?.id) {
                await chatRepo.saveChat(payload.id, payload);
                if (channelId) {
                    const existingChannel = await channelRepo.getChannel(channelId);
                    if (existingChannel) {
                        await channelRepo.saveChannel(channelId, {
                            ...existingChannel,
                            lastChat$: { ...existingChannel.lastChat$, ...payload },
                        } as CacheChannelView);
                    }
                }
                notifyAppUpdated({ domain: 'chat', action, cid: cloudId, targetId: channelId, payload });
                notifyAppUpdated({ domain: 'channel', action, cid: cloudId, targetId: channelId, payload });
            }
            break;
        }

        case 'feed': {
            const chatList = payload?.list || [];
            if (chatList.length > 0) {
                await Promise.all(chatList.map((chat: any) => chatRepo.saveChat(chat.id, chat)));
                notifyAppUpdated({ domain: 'chat', action, cid: cloudId, targetId: channelId, payload });
            }
            break;
        }

        case 'update-join': {
            if (payload && payload.id) {
                await joinRepo.saveJoin(payload.id, payload);
                notifyAppUpdated({ domain: 'join', action, cid: cloudId, targetId: payload.channelId, payload });
            }
            break;
        }

        case 'read': {
            const joinView = payload?.joinView || payload;
            if (joinView && joinView.id) {
                await joinRepo.saveJoin(joinView.id, joinView);
                notifyAppUpdated({ domain: 'join', action, cid: cloudId, targetId: joinView.channelId, payload });
            }
            break;
        }

        case 'mine': {
            const channelList = payload?.list || [];
            if (channelList.length > 0) {
                await Promise.all(
                    channelList.map((ch: any) =>
                        channelRepo.saveChannel(ch.id, { ...ch, sid: placeId } as CacheChannelView)
                    )
                );
                notifyAppUpdated({ domain: 'channel', action, cid: cloudId, payload });
            }
            break;
        }

        case 'start':
        case 'update-channel':
        case 'invite': {
            if (channelId && payload) {
                await channelRepo.saveChannel(channelId, { ...payload, sid: placeId } as CacheChannelView);
                notifyAppUpdated({ domain: 'channel', action, cid: cloudId, targetId: channelId, payload });
            }
            break;
        }

        case 'leave': {
            if (!channelId) break;
            const targetUserId = payload?.userId;
            const isKicked = targetUserId && targetUserId !== myUserId;

            if (isKicked) {
                await channelRepo.saveChannel(channelId, { ...payload, sid: placeId } as CacheChannelView);
            } else {
                await channelRepo.deleteChannel(channelId);
            }
            notifyAppUpdated({ domain: 'channel', action, cid: cloudId, targetId: channelId, payload });
            break;
        }

        case 'delete-channel': {
            if (channelId) {
                await channelRepo.deleteChannel(channelId);
                notifyAppUpdated({ domain: 'channel', action, cid: cloudId, targetId: channelId, payload });
            }
            break;
        }

        case 'users': {
            const userList = payload?.list || [];
            if (userList.length > 0) {
                await userRepo.saveUsers(userList);
                notifyAppUpdated({ domain: 'user', action, cid: cloudId, targetId: channelId, payload });
            }
            break;
        }

        case 'error':
            console.error(`[Chat Handler] Server responded with error:`, payload?.error);
            break;

        default:
            console.warn(`[Chat Handler] Unhandled chat action: ${action}`);
    }
};
