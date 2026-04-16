import { notifyAppUpdated } from '../sync-events';
import type { WSSEnvelope, WSSModelActionType } from '@lemoncloud/chatic-sockets-api';

/**
 * modelHandler
 * 서버의 웹소켓 Model 이벤트를 수신하여 로컬 DB를 즉시 갱신하고 앱 전체에 상태 변화를 알립니다.
 * * @param envelope 소켓 응답 페이로드
 * @param cloudId 현재 연결된 클라우드/워크스페이스 ID
 * @param chatRepo 메시지 로컬 저장소
 * @param channelRepo 채널 로컬 저장소
 * @param joinRepo 참여/읽음 정보 로컬 저장소
 */
export const modelHandler = async (
    envelope: WSSEnvelope,
    cloudId: string,
    chatRepo: any,
    channelRepo: any,
    joinRepo: any
) => {
    const { action, payload, meta, mid } = envelope;

    if (!payload) return;

    // 공통 식별자 및 도메인 타입 추출
    const channelId = payload.channelId ?? meta?.channel;
    const type = payload.type || payload.sourceType || 'unknown';

    try {
        switch (action as WSSModelActionType) {
            // 데이터 생성 메시지 수신
            case 'create': {
                switch (type) {
                    case 'chat':
                        // 서버에서 확정된 일반 채팅 메시지 저장
                        await chatRepo.saveChat(payload.id, {
                            ...payload,
                            isPending: false,
                            isFailed: false,
                        });
                        notifyAppUpdated({ domain: 'chat', action, cid: cloudId, targetId: channelId, payload });
                        break;

                    case 'join':
                        // 로컬 DB에 참여자 정보 저장
                        if (payload.id) {
                            await joinRepo.saveJoin(payload.id, payload);
                        }

                        // 입장/퇴장 시스템 메시지 생성 및 저장
                        if (channelId) {
                            const isEntry = (payload.joined ?? 0) >= 1;
                            const sysId = mid ?? String(Date.now());
                            const systemChat = {
                                id: sysId,
                                channelId,
                                content: `${payload.nick ?? '알 수 없음'}님이 ${isEntry ? '들어왔습니다.' : '나갔습니다.'}`,
                                createdAt: Date.now(),
                                ownerId: 'system',
                                stereo: 'system',
                                isPending: false,
                                isFailed: false,
                            };
                            await chatRepo.saveChat(sysId, systemChat);

                            // 시스템 메시지가 화면에 즉시 렌더링되도록 chat 이벤트 방출
                            notifyAppUpdated({
                                domain: 'chat',
                                action,
                                cid: cloudId,
                                targetId: channelId,
                                payload: systemChat,
                            });
                        }

                        // UI 갱신을 위한 도메인 이벤트 방출
                        notifyAppUpdated({ domain: 'join', action, cid: cloudId, targetId: channelId, payload });
                        notifyAppUpdated({ domain: 'user', action, cid: cloudId, targetId: channelId, payload });
                        break;

                    case 'channel':
                        notifyAppUpdated({ domain: 'channel', action, cid: cloudId, targetId: channelId, payload });
                        break;

                    default:
                        notifyAppUpdated({ domain: type, action, cid: cloudId, targetId: channelId, payload });
                        break;
                }
                break;
            }

            // 데이터 수정 메시지 수신
            case 'update': {
                switch (type) {
                    case 'chat':
                        await chatRepo.saveChat(payload.id, {
                            ...payload,
                            isPending: false,
                            isFailed: false,
                        });
                        notifyAppUpdated({ domain: 'chat', action, cid: cloudId, targetId: channelId, payload });
                        break;

                    case 'join':
                        if (payload.id) {
                            await joinRepo.saveJoin(payload.id, payload);
                        }
                        notifyAppUpdated({ domain: 'join', action, cid: cloudId, targetId: channelId, payload });
                        notifyAppUpdated({ domain: 'user', action, cid: cloudId, targetId: channelId, payload });
                        break;

                    case 'channel':
                        if (payload.reason === 'channel-deleted') {
                            await channelRepo.deleteChannel(payload.id ?? channelId);
                        } else {
                            // 필요 시 채널 데이터 갱신 로직 추가
                        }
                        notifyAppUpdated({ domain: 'channel', action, cid: cloudId, targetId: channelId, payload });
                        break;

                    default:
                        notifyAppUpdated({ domain: type, action, cid: cloudId, targetId: channelId, payload });
                        break;
                }
                break;
            }

            // 데이터 삭제 메시지 수신
            case 'delete': {
                switch (type) {
                    case 'chat':
                        await chatRepo.deleteChat(payload.id);
                        notifyAppUpdated({ domain: 'chat', action, cid: cloudId, targetId: channelId, payload });
                        break;

                    case 'channel':
                        await channelRepo.deleteChannel(payload.id ?? channelId);
                        notifyAppUpdated({ domain: 'channel', action, cid: cloudId, targetId: channelId, payload });
                        break;

                    case 'join':
                        // 필요 시 참여 정보 삭제 로직 추가 (await joinRepo.deleteJoin...)
                        notifyAppUpdated({ domain: 'join', action, cid: cloudId, targetId: channelId, payload });
                        notifyAppUpdated({ domain: 'user', action, cid: cloudId, targetId: channelId, payload });
                        break;

                    default:
                        notifyAppUpdated({ domain: type, action, cid: cloudId, targetId: channelId, payload });
                        break;
                }
                break;
            }

            default: {
                console.warn(`[Model Handler] Unhandled action: ${action}`);
                break;
            }
        }
    } catch (error) {
        console.error(`[Model Handler] DB Sync Error for action ${action} and type ${type}:`, error);
    }
};
