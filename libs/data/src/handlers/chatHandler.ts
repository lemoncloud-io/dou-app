import { notifyAppUpdated } from '../sync-events';
import { reportError } from '@chatic/web-core';
import type { WSSChatActionType, WSSEnvelope } from '@lemoncloud/chatic-sockets-api';
import type { CacheChannelView } from '@chatic/app-messages';
import type { ChannelView } from '@lemoncloud/chatic-socials-api';

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
    placeId: string | null,
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
                        const isMine = payload?.ownerId === myUserId;
                        const prevUnread = existingChannel.unreadCount ?? 0;
                        const nextUnread = isMine ? 0 : prevUnread + 1;
                        await channelRepo.saveChannel(channelId, {
                            ...existingChannel,
                            lastChat$: { ...existingChannel.lastChat$, ...payload },
                            unreadCount: nextUnread,
                        } as CacheChannelView);
                    }
                }
                notifyAppUpdated({
                    domain: 'chat',
                    action,
                    cid: cloudId,
                    targetId: channelId,
                    payload,
                    ref: meta?.ref,
                });
            }
            break;
        }

        case 'feed': {
            const chatList = payload?.list || [];
            if (chatList.length > 0) {
                await Promise.all(chatList.map((chat: any) => chatRepo.saveChat(chat.id, chat)));
            }
            // 항상 notify — list 비어도 cursorNo 전달 필요
            notifyAppUpdated({ domain: 'chat', action, cid: cloudId, targetId: channelId, payload });
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
                    channelList.map((ch: any) => {
                        const sid = (ch as ChannelView)?.$?.sid || placeId || '';
                        return channelRepo.saveChannel(ch.id, { ...ch, sid } as CacheChannelView);
                    })
                );
            }
            // 항상 notify — list 비어도 confirmed channel IDs 갱신 필요
            // targetId에 placeId를 전달하여 useChannels에서 stale 응답을 감지할 수 있도록 함
            notifyAppUpdated({ domain: 'channel', action, cid: cloudId, targetId: placeId ?? undefined, payload });
            break;
        }

        case 'start': {
            // start 응답은 payload.id가 새 채널 ID (channelId/meta.channel 없음)
            const newChannelId = channelId || payload?.id;
            if (newChannelId && payload) {
                const sid = payload?.$?.sid || placeId || '';
                await channelRepo.saveChannel(newChannelId, {
                    ...payload,
                    sid,
                } as CacheChannelView);

                // $joins 배열이 포함된 경우 join 정보도 저장
                const joins = payload?.$joins || [];
                if (joins.length > 0) {
                    await Promise.all(joins.map((join: any) => joinRepo.saveJoin(join.id, join)));
                }

                notifyAppUpdated({ domain: 'channel', action, cid: cloudId, targetId: newChannelId, payload });
            }
            break;
        }

        case 'update-channel': {
            if (channelId && payload) {
                const existingChannel = await channelRepo.getChannel(channelId);
                await channelRepo.saveChannel(channelId, {
                    ...(existingChannel || {}),
                    ...payload,
                } as CacheChannelView);
                notifyAppUpdated({ domain: 'channel', action, cid: cloudId, targetId: channelId, payload });
            }
            break;
        }

        case 'invite': {
            if (channelId && payload) {
                const existingChannel = await channelRepo.getChannel(channelId);
                const prevMemberNo = existingChannel?.memberNo ?? 0;
                await channelRepo.saveChannel(channelId, {
                    ...(existingChannel || {}),
                    ...payload,
                    memberNo: payload.memberNo ?? prevMemberNo + 1,
                } as CacheChannelView);

                // $joins 배열이 포함된 경우 join 정보도 개별 저장 (start case와 동일 패턴)
                const joins = payload?.$joins || [];
                if (joins.length > 0) {
                    await Promise.all(joins.map((join: any) => joinRepo.saveJoin(join.id, join)));
                }

                notifyAppUpdated({ domain: 'channel', action, cid: cloudId, targetId: channelId, payload });
                // useChats가 새 멤버 기준으로 unreadCount를 재계산하도록 join 도메인도 알림
                notifyAppUpdated({ domain: 'join', action, cid: cloudId, targetId: channelId, payload });
            }
            break;
        }

        case 'leave': {
            if (!channelId) break;
            const targetUserId = payload?.userId;
            const isKicked = targetUserId && targetUserId !== myUserId;

            if (isKicked) {
                const existingChannel = await channelRepo.getChannel(channelId);
                await channelRepo.saveChannel(channelId, {
                    ...(existingChannel || {}),
                    ...payload,
                } as CacheChannelView);
            } else {
                await channelRepo.deleteChannel(channelId);
            }
            notifyAppUpdated({ domain: 'channel', action, cid: cloudId, targetId: channelId, payload });
            // useChats가 멤버 변경 기준으로 unreadCount를 재계산하도록 join 도메인도 알림
            notifyAppUpdated({ domain: 'join', action, cid: cloudId, targetId: channelId, payload });
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
            reportError(new Error(`[WS:chat] ${(payload as any)?.error ?? 'Unknown chat error'}`));
            // chat 에러를 useChannels에 전달하여 에러 상태 + 재시도 처리
            notifyAppUpdated({ domain: 'channel', action: 'error', cid: cloudId, payload });
            break;

        default:
            console.warn(`[Chat Handler] Unhandled chat action: ${action}`);
    }
};
