import { useEffect } from 'react';
import { cloudCore, useDynamicProfile } from '@chatic/web-core';
import { useChannelRepository } from '../repository';
import { notifyDbUpdated } from './utils';
import type { CacheChannelView } from '@chatic/app-messages';
import { useWebSocketV2Store } from '@chatic/socket';

export const useChannelCacheSync = () => {
    const repository = useChannelRepository();
    const profile = useDynamicProfile();
    const myProfileId = profile?.uid ?? ''; // 현재 로그인한 사용자 ID
    const placeId = cloudCore.getSelectedPlaceId() ?? 'default';

    useEffect(() => {
        // 웹소켓 메시지 수신 시 실행될 핸들러
        const handleSyncMessage = async (envelope: any) => {
            // chat(채팅) 또는 model(데이터 모델) 타입이 아니면 무시
            if (!envelope || !['chat', 'model'].includes(envelope.type)) return;

            const { action, payload } = envelope;
            const channelId = payload?.id ?? payload?.channelId;
            let isDbUpdated = false;

            switch (action) {
                case 'mine': {
                    // '내 채널 목록' 전체 동기화 이벤트
                    // 모든 채널 정보에 현재 sid(placeId)를 주입하여 저장
                    const channelList = payload?.list || [];
                    if (channelList.length > 0) {
                        await Promise.all(
                            channelList.map((ch: any) =>
                                repository.saveChannel(ch.id ?? '', {
                                    ...ch,
                                    sid: placeId,
                                } as CacheChannelView)
                            )
                        );
                        // 전체 목록 갱신 알림
                        notifyDbUpdated({ domain: 'channel', cid: repository.cloudId });
                    }
                    return;
                }

                case 'leave': {
                    // 채널 퇴장 이벤트 (자발적 퇴장 또는 강퇴)
                    if (!channelId) break;
                    const targetUserId = payload?.userId;
                    const isKicked = targetUserId && targetUserId !== myProfileId;

                    if (isKicked) {
                        // 내가 아닌 타인이 나간 경우: 채널 정보(인원수 등)만 업데이트
                        await repository.saveChannel(channelId, {
                            ...payload,
                            sid: placeId,
                        } as CacheChannelView);
                    } else {
                        // 내가 나간 경우: 해당 채널을 로컬 DB에서 삭제
                        await repository.deleteChannel(channelId);
                    }
                    isDbUpdated = true;
                    break;
                }

                case 'delete-channel': {
                    // 채널 삭제 이벤트: 로컬 DB에서 즉시 제거
                    if (!channelId) break;
                    await repository.deleteChannel(channelId);
                    isDbUpdated = true;
                    break;
                }

                case 'update': {
                    // 채널 업데이트 이벤트
                    if (!channelId) break;
                    if (envelope.type === 'model' && payload?.reason === 'channel-deleted') {
                        await repository.deleteChannel(channelId);
                        isDbUpdated = true;
                    }
                    break;
                }

                case 'invite':
                case 'start': {
                    if (!channelId || !payload) break;
                    await repository.saveChannel(channelId, {
                        ...payload,
                        sid: placeId,
                    } as CacheChannelView);

                    isDbUpdated = true;
                    break;
                }
            }

            // DB 업데이트 성공 시 UI 갱신을 위한 브로드캐스트 이벤트 발행
            if (isDbUpdated && channelId) {
                notifyDbUpdated({ domain: 'channel', cid: repository.cloudId, channelId });
            }
        };

        const unsubscribe = useWebSocketV2Store.subscribe(state => state.lastMessage, handleSyncMessage);
        return () => unsubscribe();
    }, [repository, myProfileId]);
};
