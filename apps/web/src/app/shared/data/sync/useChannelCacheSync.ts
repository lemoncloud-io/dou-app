import { useEffect } from 'react';
import { cloudCore, useDynamicProfile } from '@chatic/web-core';
import { useChannelRepository } from '../repository';
import type { CacheChannelView } from '@chatic/app-messages';
import { useWebSocketV2Store } from '@chatic/socket';

/**
 * 앱 백그라운드에서 동작하며, 채널(방) 생성/삭제, 멤버 변경, 메시지 수발신 이벤트를 수신
 * 로컬 IndexedDB(Channel 도메인)와 동기화하고 전역 UI 갱신 이벤트를 방출하는 Sync 훅
 */
export const useChannelCacheSync = () => {
    const repository = useChannelRepository();
    const profile = useDynamicProfile();
    const myProfileId = profile?.uid ?? '';
    const placeId = cloudCore.getSelectedPlaceId() ?? 'default';

    useEffect(() => {
        const handleSyncMessage = async (envelope: any) => {
            if (!envelope || !['chat', 'model'].includes(envelope.type)) return;

            // 현재 소켓이 바라보는 클라우드와 DB의 클라우드가 일치하는지 검증
            const cloudId = useWebSocketV2Store.getState().cloudId;
            if (!cloudId || repository.cloudId !== cloudId) return;

            const { type, action, payload } = envelope;
            const channelId = payload?.channelId ?? 'default';
            let isDbUpdated = false;

            switch (action) {
                /**
                 * 내 채널 전체 목록 수신
                 */
                case 'mine': {
                    const channelList = payload?.list || [];
                    if (channelList.length > 0) {
                        const mappedChannels: CacheChannelView[] = channelList.map(
                            (ch: any) =>
                                ({
                                    ...ch,
                                    sid: placeId,
                                }) as CacheChannelView
                        );

                        await Promise.all(
                            mappedChannels.map((ch: CacheChannelView) => repository.saveChannel(ch.id ?? 'default', ch))
                        );

                        notifyChannelDbUpdated({ domain: 'channel', cid: repository.cloudId });
                    }
                    return;
                }

                /**
                 * 방 나가기 및 강퇴 처리
                 */
                case 'leave': {
                    if (!channelId) break;
                    const targetUserId = payload?.userId;
                    const isKicked = targetUserId && targetUserId !== myProfileId;

                    /**
                     * 내가 나간 게 아니라면(타인 퇴장/강퇴) 방 정보만 업데이트하기
                     * 내가 나갔다면 DB에서 방을 삭제하기
                     */
                    if (isKicked) {
                        await repository.saveChannel(channelId, { ...payload, sid: placeId } as CacheChannelView);
                    } else {
                        await repository.deleteChannel(channelId);
                    }
                    isDbUpdated = true;
                    break;
                }

                /**
                 * 채널 완전 삭제
                 */
                case 'delete-channel': {
                    if (!channelId) break;
                    await repository.deleteChannel(channelId);
                    isDbUpdated = true;
                    break;
                }

                /**
                 * 채널 정보 (이름, 설명 등) 업데이트
                 */
                case 'update-channel': {
                    if (!channelId || !payload) break;
                    await repository.saveChannel(channelId, { ...payload, sid: placeId } as CacheChannelView);
                    isDbUpdated = true;
                    break;
                }

                // 시스템 사유로 인한 방 폭파 감지
                case 'update': {
                    if (!channelId) break;
                    if (type === 'model' && payload?.reason === 'channel-deleted') {
                        await repository.deleteChannel(channelId);
                        isDbUpdated = true;
                    }
                    break;
                }

                /**
                 * 신규 방 생성 및 초대
                 */
                case 'invite':
                case 'start': {
                    if (!channelId || !payload) break;
                    await repository.saveChannel(channelId, { ...payload, sid: placeId } as CacheChannelView);
                    isDbUpdated = true;
                    break;
                }

                /**
                 * 내가 보낸 메시지가 서버에 전송 완료되었을 때; 채널 목록 프리뷰(lastChat$) 최신화
                 */
                case 'send': {
                    if (!channelId || !payload) break;
                    const existingChannel = await repository.getChannel(channelId);
                    if (existingChannel) {
                        await repository.saveChannel(channelId, {
                            ...existingChannel,
                            lastChat$: {
                                ...existingChannel.lastChat$,
                                ...payload, // 방금 보낸 최신 메시지로 병합
                            },
                        } as CacheChannelView);
                        isDbUpdated = true;
                    }
                    break;
                }
            }

            /**
             *  타인이 채팅을 보냈을 때; 채널 목록 프리뷰(lastChat$) 최신화
             */
            if (type === 'model' && action === 'create') {
                if (!payload?.sourceType || payload?.sourceType === 'chat') {
                    const targetChannelId = payload.channelId;
                    if (targetChannelId) {
                        const existingChannel = await repository.getChannel(targetChannelId);
                        if (existingChannel) {
                            await repository.saveChannel(targetChannelId, {
                                ...existingChannel,
                                lastChat$: {
                                    ...payload,
                                    id: payload.id,
                                    content: payload.content,
                                    createdAt: payload.createdAt,
                                },
                            } as CacheChannelView);
                            isDbUpdated = true;
                        }
                    }
                }
            }

            if (isDbUpdated) {
                notifyChannelDbUpdated({
                    domain: 'channel',
                    cid: repository.cloudId,
                    targetChannelId: channelId,
                    action: action,
                });
            }
        };

        const unsubscribe = useWebSocketV2Store.subscribe(state => state.lastMessage, handleSyncMessage);
        return () => unsubscribe();
    }, [repository, myProfileId, placeId]);
};

/**
 * 로컬 DB가 갱신되었음을 현재 브라우저 탭(CustomEvent)과
 * 다른 브라우저 탭(BroadcastChannel)의 모든 UI 컴포넌트에게 알리는 유틸리티 함수
 */
const notifyChannelDbUpdated = (detail: {
    domain: 'channel';
    cid: string;
    targetChannelId?: string;
    action?: string;
}) => {
    window.dispatchEvent(new CustomEvent('local-db-updated', { detail }));
    const bc = new BroadcastChannel('app-db-sync');
    bc.postMessage(detail);
    bc.close();
};
