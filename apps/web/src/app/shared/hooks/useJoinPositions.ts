import { useCallback, useEffect, useRef, useState } from 'react';

import type { JoinView } from '@lemoncloud/chatic-socials-api';

import { useRepositories } from '../data';

interface JoinPosition {
    chatNo: number;
    joinedNo: number;
}

interface ReadCountResult {
    readCount: number;
    unreadCount: number;
}

interface UseJoinPositionsReturn {
    activeMemberCount: number;
    getReadCount: (messageChatNo: number) => ReadCountResult;
    isReady: boolean;
}

/**
 * JoinView 기반으로 멤버별 읽음 위치를 관리하고, 메시지별 readCount/unreadCount를 계산하는 훅.
 *
 * @param channelId 대상 채널 ID
 * @param initialJoins useChannelMembers(detail:true) 응답의 UserView.$join 배열로 초기 위치 구성
 */
export const useJoinPositions = (channelId: string | null, initialJoins: JoinView[]): UseJoinPositionsReturn => {
    const { join: joinRepository } = useRepositories();
    const positionsRef = useRef<Map<string, JoinPosition>>(new Map());
    const [version, setVersion] = useState(0);
    const [isReady, setIsReady] = useState(false);
    const hasFreshJoinsRef = useRef(false);

    // 캐시에서 초기 위치 빠르게 로드 (network 응답 전에 즉시 표시)
    useEffect(() => {
        if (!channelId) return;
        hasFreshJoinsRef.current = false;
        positionsRef.current = new Map();
        setIsReady(false);

        let cancelled = false;

        const loadFromCache = async () => {
            try {
                const result = await joinRepository.fetchJoins({ channelId }, { cachePolicy: 'cache-only' });
                if (cancelled || hasFreshJoinsRef.current) return;
                const list = result?.list;
                if (!list?.length) return;

                const nextMap = new Map<string, JoinPosition>();
                for (const join of list) {
                    if (!join.userId || join.joined === 0) continue;
                    nextMap.set(join.userId, {
                        chatNo: join.chatNo ?? 0,
                        joinedNo: join.joinedNo ?? 0,
                    });
                }
                if (nextMap.size > 0) {
                    positionsRef.current = nextMap;
                    setIsReady(true);
                    setVersion(v => v + 1);
                }
            } catch {
                // 캐시 읽기 실패 — initialJoins 대기
            }
        };
        void loadFromCache();

        return () => {
            cancelled = true;
        };
    }, [joinRepository, channelId]);

    // 초기 위치 맵 구성 (initialJoins가 network에서 도착할 때 갱신)
    useEffect(() => {
        // 빈 배열은 아직 로딩 중이므로 캐시 데이터를 유지
        if (initialJoins.length === 0) return;

        hasFreshJoinsRef.current = true;
        const nextMap = new Map<string, JoinPosition>();

        for (const join of initialJoins) {
            if (!join.userId || join.joined === 0) continue;
            nextMap.set(join.userId, {
                chatNo: join.chatNo ?? 0,
                joinedNo: join.joinedNo ?? 0,
            });
        }

        positionsRef.current = nextMap;
        setIsReady(nextMap.size > 0);
        setVersion(v => v + 1);
    }, [initialJoins]);

    // join:update 구독 — 유저 읽음 위치 갱신
    useEffect(() => {
        if (!channelId) return;

        const unsubUpdated = joinRepository.onJoinUpdated((join: JoinView) => {
            if (join.channelId !== channelId) return;
            const userId = join.userId;
            if (!userId) return;

            const current = positionsRef.current.get(userId);
            const newChatNo = join.chatNo ?? 0;
            const newJoinedNo = join.joinedNo ?? current?.joinedNo ?? 0;

            // chatNo가 증가한 경우에만 업데이트 (단방향)
            if (current && newChatNo <= current.chatNo && newJoinedNo === current.joinedNo) return;

            positionsRef.current.set(userId, {
                chatNo: Math.max(newChatNo, current?.chatNo ?? 0),
                joinedNo: newJoinedNo,
            });
            setVersion(v => v + 1);
        });

        return unsubUpdated;
    }, [joinRepository, channelId]);

    // join:create 구독 — 새 멤버 추가
    useEffect(() => {
        if (!channelId) return;

        const unsubCreated = joinRepository.onJoinCreated((join: JoinView) => {
            if (join.channelId !== channelId) return;
            const userId = join.userId;
            if (!userId || join.joined === 0) return;

            positionsRef.current.set(userId, {
                chatNo: join.chatNo ?? 0,
                joinedNo: join.joinedNo ?? 0,
            });
            setVersion(v => v + 1);
        });

        return unsubCreated;
    }, [joinRepository, channelId]);

    // join:delete 구독 — 멤버 제거
    useEffect(() => {
        if (!channelId) return;

        const unsubDeleted = joinRepository.onJoinDeleted((join: JoinView) => {
            if (join.channelId !== channelId) return;
            const userId = join.userId;
            if (!userId) return;

            positionsRef.current.delete(userId);
            setVersion(v => v + 1);
        });

        return unsubDeleted;
    }, [joinRepository, channelId]);

    const activeMemberCount = positionsRef.current.size;

    const getReadCount = useCallback(
        (messageChatNo: number): ReadCountResult => {
            // version을 참조하여 React가 리렌더를 트리거하도록 보장
            void version;

            let readCount = 0;
            for (const pos of positionsRef.current.values()) {
                // 해당 메시지를 읽었고(chatNo >= messageChatNo), 참여 이후의 메시지인 경우(joinedNo <= messageChatNo)
                if (pos.chatNo >= messageChatNo && pos.joinedNo <= messageChatNo) {
                    readCount++;
                }
            }

            const memberCount = positionsRef.current.size;
            return {
                readCount,
                unreadCount: Math.max(0, memberCount - readCount),
            };
        },
        [version]
    );

    return {
        activeMemberCount,
        getReadCount,
        isReady,
    };
};
