import { useCallback, useEffect, useMemo, useState } from 'react';

import { logger } from '@chatic/bridges';
import type { DomainChannel } from '@chatic/data';
import type { ClientChannelView } from '../types';
import { useSessionIdentity } from 'libs/web-core/src';

import { useRuntimeRepositories } from '@chatic/app-runtime';

// toClientChannel에 joinCount(참여자 수)를 주입받을 수 있도록 파라미터 추가
const toClientChannel = (channel: DomainChannel, userId?: string, joinCount?: number): ClientChannelView => {
    const lastChatNo = channel.lastChat$?.chatNo ?? channel.chatNo ?? 0;
    const lastMessageIsMine = channel.lastChat$?.ownerId === userId;
    const myReadNo = lastMessageIsMine ? lastChatNo : (channel.$join?.chatNo ?? 0);

    // Join 스트림에서 받은 count가 있으면 우선 적용, 없으면 채널 내부 데이터 폴백
    const memberCount = joinCount ?? channel.memberIds?.length ?? channel.$joins?.length ?? 0;

    return {
        ...channel,
        isOwner: channel.ownerId === userId,
        isSelfChat: channel.stereo === 'self',
        memberCount,
        unreadCount: channel.unreadCount ?? Math.max(0, lastChatNo - myReadNo),
    };
};

/**
 * 특정 채널의 상세 정보를 Repository의 구독(Stream)을 통해 실시간으로 렌더링하는 훅
 */
export const useChannel = (channelId: string | null) => {
    const { channel: channelRepository, join: joinRepository } = useRuntimeRepositories();
    const { activeProfile: profile } = useSessionIdentity();
    const userId = profile?.uid;

    // 스트림에서 내려오는 원본 도메인 데이터 상태
    const [domainChannel, setDomainChannel] = useState<DomainChannel | null>(null);
    const [joinCount, setJoinCount] = useState<number | undefined>(undefined);

    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!channelId) {
            setDomainChannel(null);
            setJoinCount(undefined);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);

        const unsubscribeChannel = channelRepository.subscribeItem(channelId, ch => {
            setDomainChannel(ch);
            setIsLoading(false);
        });

        const unsubscribeJoins = joinRepository.subscribeList({ channelId }, result => {
            if (result === null) return;
            setJoinCount(result.meta?.total ?? result.list.length);
        });

        return () => {
            unsubscribeChannel();
            unsubscribeJoins();
        };
    }, [channelId, channelRepository, joinRepository]);

    // 도메인 모델이나 userId, joinCount가 변경될 때만 ClientView를 재생성
    const channel = useMemo(() => {
        if (!domainChannel) return null;
        return toClientChannel(domainChannel, userId, joinCount);
    }, [domainChannel, userId, joinCount]);

    // 필요 시 강제 네트워크 갱신을 위한 refresh 함수 (스트림이 켜져 있으므로 상태가 자동 갱신됨)
    const refresh = useCallback(() => {
        if (!channelId) return;
        channelRepository.fetchChannel({ detail: true, limit: 100 }, { cachePolicy: 'network-only' }).catch(error => {
            logger.error('DATA', `Failed to fetch channel ${channelId} from repository`, {
                error,
                data: { channelId },
            });
        });
    }, [channelId, channelRepository]);

    return {
        channel,
        isLoading,
        isError: false, // 스트림 방식에서는 로컬 캐시를 지속 관찰하므로 치명적인 조회 에러 상태를 덜어냅니다.
        refresh,
    };
};
