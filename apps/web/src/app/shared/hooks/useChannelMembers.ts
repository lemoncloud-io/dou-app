import { useCallback, useEffect, useState } from 'react';
import { logger } from '@chatic/bridges';
import { useInterval } from '@chatic/shared';
import type { ChatUsersPayload } from '@lemoncloud/chatic-sockets-api';
import { useRepositories } from '@chatic/app-runtime';
import type { DomainUser, RepositoryCachePolicy } from '@chatic/data';

const MEMBER_POLL_INTERVAL_MS = 10_000;

/**
 * 특정 채널의 멤버 목록을 캐시 우선 전략으로 조회하고, 실시간으로 동기화하는 훅.
 */
export const useChannelMembers = (initialParams: ChatUsersPayload) => {
    const { user: userRepository, join: joinRepository } = useRepositories();
    const targetChannelId = initialParams.channelId;

    const [members, setMembers] = useState<DomainUser[] | null>(null); // 로딩 상태 구분을 위해 null로 초기화
    const [total, setTotal] = useState(0);
    const [isError, setIsError] = useState(false);

    /**
     * 실시간 캐시 변경을 구독하여 멤버 목록을 업데이트합니다.
     */
    useEffect(() => {
        if (!targetChannelId) {
            setMembers([]);
            return;
        }

        // userRepository가 subscribeList와 같은 스트림 인터페이스를 제공한다고 가정합니다.
        // 이 스트림은 특정 채널의 사용자 목록 캐시가 변경될 때마다 새 목록을 발행합니다.
        const unsubscribe = userRepository.subscribeList({ channelId: targetChannelId }, result => {
            if (result === null) return;
            setMembers(result.list);
            setTotal(result.meta?.total ?? result.list.length);
        });

        return () => unsubscribe();
    }, [targetChannelId, userRepository]);

    /**
     * 초기 데이터 로드 및 수동 새로고침을 담당하는 함수.
     */
    const fetchInitialMembers = useCallback(
        (policy: RepositoryCachePolicy) => {
            if (!targetChannelId) return;

            setIsError(false);
            if (policy === 'network-only') {
                setMembers(null); // 새로고침 시 로딩 상태 표시
            }

            userRepository
                .fetchUsers({ channelId: targetChannelId, detail: true }, { cachePolicy: policy })
                .then(result => {
                    // fetchUsers가 캐시/네트워크에서 가져온 최신 데이터로 상태를 즉시 업데이트합니다.
                    // subscribeList가 백그라운드 업데이트를 처리하므로, 여기서의 업데이트는 초기 표시 속도를 위함입니다.
                    setMembers(result.list);
                    setTotal(result.meta?.total ?? result.list.length);
                })
                .catch(error => {
                    logger.error('CHANNEL', 'Failed to fetch members', {
                        error,
                        data: { channelId: targetChannelId },
                    });
                    setIsError(true);
                });
        },
        [targetChannelId, userRepository]
    );

    /**
     * 컴포넌트 마운트 시 초기 멤버 목록을 로드합니다.
     */
    useEffect(() => {
        fetchInitialMembers('cache-first');
    }, [fetchInitialMembers]);

    /**
     * 채널 참여/이탈 이벤트를 감지하여 캐시를 직접 업데이트하거나,
     * 데이터가 부족할 경우 전체 목록을 다시 불러옵니다.
     */
    useEffect(() => {
        const unsubCreated = joinRepository.onJoinCreated(join => {
            if (join.channelId !== targetChannelId) return;
            // user 정보가 없다면, 전체 목록을 다시 동기화합니다.
            fetchInitialMembers('cache-first');
        });

        const unsubDeleted = joinRepository.onJoinDeleted(join => {
            if (join.channelId !== targetChannelId) return;
            // join 이벤트에 포함된 userId로 캐시에서 해당 유저를 삭제합니다.
            // userRepository에 cacheDelete와 같은 메서드가 있다고 가정합니다.
            if (join.userId) {
                userRepository
                    .cacheDelete(join.userId)
                    .catch(e => logger.error('CACHE', 'Failed to delete user cache', e));
            } else {
                // userId 정보가 없다면, 전체 목록을 다시 동기화합니다.
                fetchInitialMembers('cache-first');
            }
        });

        return () => {
            unsubCreated();
            unsubDeleted();
        };
    }, [joinRepository, targetChannelId, fetchInitialMembers, userRepository]);

    // join 정보 주기적 폴링 (WebSocket push 누락 보완)
    useInterval(
        () => {
            fetchInitialMembers('cache-first');
        },
        targetChannelId ? MEMBER_POLL_INTERVAL_MS : null
    );

    const isLoading = members === null;

    return {
        members: members ?? [], // UI에서는 항상 배열을 반환
        total,
        isLoading,
        isSyncing: isLoading, // isSyncing을 isLoading과 동일하게 처리 (더 단순한 상태)
        isError,
        refresh: () => fetchInitialMembers('network-only'),
        sync: () => fetchInitialMembers('cache-first'),
    };
};
