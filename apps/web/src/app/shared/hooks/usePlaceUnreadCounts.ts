import { useCallback, useEffect, useRef, useState } from 'react';

import { logger } from '@chatic/app-messages';
import { useInterval } from '@chatic/shared';
import { useWebSocketV2Store } from '@chatic/socket';
import type { DomainChannel, DomainChannelListPayload, DomainChat, DomainJoin } from '@chatic/data';
import { cloudCore } from '@chatic/web-core';

import { useRepositories } from '../data';
import { debounce } from '../utils/debounce';

const POLL_INTERVAL_MS = 30_000;
const EVENT_DEBOUNCE_MS = 1_000;

/**
 * 모든 place의 안읽은 메시지 수를 집계하여 Record<placeId, unreadCount>로 반환합니다.
 * hasSite: false 로 chat:mine을 호출하여 모든 place의 채널을 한 번에 가져옵니다.
 *
 * Cloud 전환 중 fetch 방지:
 * - selectCloud() 시 setCloudId + setIsVerified(false)가 동시에 호출됨
 * - React 18 automatic batching으로 하나의 렌더에서 처리
 * - isVerified=false 또는 selectedPlaceId=null인 동안 모든 fetch가 차단됨
 * - 전환 완료 후 isVerified=true + selectedPlaceId=newPlaceId가 되면 재조회
 */
export const usePlaceUnreadCounts = (): Record<string, number> => {
    const { channel: channelRepository, chat: chatRepository, join: joinRepository } = useRepositories();
    const isVerified = useWebSocketV2Store(s => s.isVerified);
    const storeCloudId = useWebSocketV2Store(s => s.cloudId);
    const selectedPlaceId = useWebSocketV2Store(s => s.selectedPlaceId);
    const cloudId = storeCloudId || cloudCore.getSelectedCloudId() || null;

    const [counts, setCounts] = useState<Record<string, number>>({});
    const requestSeqRef = useRef(0);
    const isVerifiedRef = useRef(isVerified);
    isVerifiedRef.current = isVerified;
    const cloudIdRef = useRef(cloudId);
    cloudIdRef.current = cloudId;
    const selectedPlaceIdRef = useRef(selectedPlaceId);
    selectedPlaceIdRef.current = selectedPlaceId;

    const fetchCounts = useCallback(async () => {
        if (!isVerifiedRef.current || !cloudIdRef.current || !selectedPlaceIdRef.current) return;

        const requestSeq = ++requestSeqRef.current;

        try {
            const result = await channelRepository.fetchChannel(
                { hasSite: false, limit: 500 } as unknown as DomainChannelListPayload,
                { cachePolicy: 'network-only' }
            );

            if (requestSeqRef.current !== requestSeq) return;

            const grouped: Record<string, number> = {};
            for (const ch of result.list ?? []) {
                const sid = (ch as DomainChannel).sid;
                if (!sid) continue;
                const unread = (ch.unreadCount as number) ?? 0;
                grouped[sid] = (grouped[sid] ?? 0) + unread;
            }

            setCounts(grouped);
        } catch (error) {
            if (requestSeqRef.current !== requestSeq) return;
            logger.error('PLACE_UNREAD', '[usePlaceUnreadCounts] fetch failed', { error });
        }
    }, [channelRepository]);

    // cloudId 변경 시 counts 초기화 + 진행 중인 요청 무효화
    const prevCloudIdRef = useRef(cloudId);
    useEffect(() => {
        if (prevCloudIdRef.current !== cloudId) {
            setCounts({});
            ++requestSeqRef.current;
            prevCloudIdRef.current = cloudId;
        }
    }, [cloudId]);

    // isVerified/place 전환 시 재조회 (counts 초기화 없이)
    useEffect(() => {
        if (isVerified && cloudId && selectedPlaceId) {
            void fetchCounts();
        }
    }, [fetchCounts, isVerified, cloudId, selectedPlaceId]);

    // 채널/채팅/읽음 이벤트 구독 — debounce로 재조회
    useEffect(() => {
        const debouncedFetch = debounce(() => void fetchCounts(), EVENT_DEBOUNCE_MS);

        const unsubs = [
            channelRepository.onChannelCreated(() => debouncedFetch()),
            channelRepository.onChannelUpdated(() => debouncedFetch()),
            channelRepository.onChannelDeleted(() => debouncedFetch()),
            chatRepository.onChatCreated((_chat: DomainChat) => debouncedFetch()),
            joinRepository.onJoinUpdated((_join: DomainJoin) => debouncedFetch()),
        ];

        return () => unsubs.forEach(fn => fn());
    }, [channelRepository, chatRepository, joinRepository, fetchCounts]);

    // 폴링: 30초 간격 (place 선택 완료 후에만)
    useInterval(() => void fetchCounts(), isVerified && cloudId && selectedPlaceId ? POLL_INTERVAL_MS : null);

    return counts;
};
