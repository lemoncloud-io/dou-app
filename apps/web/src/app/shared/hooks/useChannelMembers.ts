import { useCallback, useEffect, useRef, useState } from 'react';

import { logger } from '@chatic/app-messages';
import type { ChatUsersPayload } from '@lemoncloud/chatic-sockets-api';

import { useRepositories } from '../data';
import type { DomainUser } from '@chatic/data';

/**
 * 특정 채널의 멤버 목록을 repository를 통해 조회하고, 실시간 동기화 이벤트에 반응하는 훅
 */
export const useChannelMembers = (initialParams: ChatUsersPayload) => {
    const { user: userRepository, join: joinRepository } = useRepositories();
    const targetChannelId = initialParams.channelId;
    const requestSeqRef = useRef(0);
    const currentParamsRef = useRef(initialParams);

    const [members, setMembers] = useState<DomainUser[]>([]);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isError, setIsError] = useState(false);

    const fetchMembers = useCallback(
        async (params?: ChatUsersPayload, options?: { loading?: boolean }) => {
            const nextParams = { ...currentParamsRef.current, ...params };
            currentParamsRef.current = nextParams;

            const channelId = nextParams.channelId ?? targetChannelId;

            if (!channelId) {
                setMembers([]);
                setTotal(0);
                setIsLoading(false);
                setIsSyncing(false);
                setIsError(false);
                return;
            }

            const requestSeq = requestSeqRef.current + 1;
            requestSeqRef.current = requestSeq;

            if (options?.loading) setIsLoading(true);
            setIsSyncing(true);
            setIsError(false);

            try {
                const result = await userRepository.fetchUsers(
                    { ...nextParams, channelId },
                    { cachePolicy: 'network-only' }
                );
                if (requestSeqRef.current !== requestSeq) return;

                setMembers(result.list ?? []);
                setTotal(result.total ?? result.list?.length ?? 0);
            } catch (error) {
                if (requestSeqRef.current !== requestSeq) return;

                logger.error('CHANNEL', 'Failed to fetch members from repository', {
                    error,
                    data: { channelId },
                });
                setIsError(true);
            } finally {
                if (requestSeqRef.current === requestSeq) {
                    setIsLoading(false);
                    setIsSyncing(false);
                }
            }
        },
        [userRepository, targetChannelId]
    );

    useEffect(() => {
        currentParamsRef.current = initialParams;
        void fetchMembers(initialParams, { loading: true });
    }, [fetchMembers, targetChannelId]);

    useEffect(() => {
        const unsubCreated = joinRepository.onJoinCreated(join => {
            if (join.channelId !== targetChannelId) return;
            void fetchMembers();
        });
        const unsubDeleted = joinRepository.onJoinDeleted(join => {
            if (join.channelId !== targetChannelId) return;
            void fetchMembers();
        });
        return () => {
            unsubCreated();
            unsubDeleted();
        };
    }, [joinRepository, targetChannelId, fetchMembers]);

    return {
        members,
        total,
        isLoading,
        isSyncing,
        isError,
        refresh: (options?: ChatUsersPayload) => void fetchMembers(options),
        sync: (options?: ChatUsersPayload) => void fetchMembers(options),
    };
};
