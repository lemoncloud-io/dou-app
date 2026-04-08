import { useCallback, useMemo } from 'react';
import { createStorageAdapter } from '../local';
import { useWebSocketV2Store } from '@chatic/socket';
import type { JoinView } from '@lemoncloud/chatic-socials-api';

/**
 * 채널 참여 정보(Join)의 로컬 영속성(Persistence)을 관리하는 리포지토리
 */
export const useJoinRepository = () => {
    const cloudId = useWebSocketV2Store(s => s.cloudId) ?? 'default';

    const joinDB = useMemo(() => (cloudId ? createStorageAdapter<JoinView>('join', cloudId) : null), [cloudId]);

    /**
     * 특정 채널에서 '현재 참여 중'인 정보만 필터링하여 반환합니다.
     */
    const getActiveJoinsByChannel = useCallback(
        async (channelId: string): Promise<JoinView[]> => {
            if (!joinDB) return [];
            const joins = await joinDB.loadAll();
            return joins.filter(j => j.channelId === channelId && (j.joined === 1 || j.joined === undefined));
        },
        [joinDB]
    );

    /**
     * 특정 채널의 모든 참여 정보(나간 사람 포함)를 반환합니다.
     */
    const getJoinsByChannel = useCallback(
        async (channelId: string): Promise<JoinView[]> => {
            if (!joinDB) return [];
            const joins = await joinDB.loadAll();
            return joins.filter(j => j.channelId === channelId);
        },
        [joinDB]
    );

    const getJoin = useCallback(
        async (id: string): Promise<JoinView | null> => {
            return joinDB ? await joinDB.load(id) : null;
        },
        [joinDB]
    );

    const saveJoin = useCallback(
        async (id: string, join: JoinView): Promise<void> => {
            if (joinDB) await joinDB.save(id, join);
        },
        [joinDB]
    );

    /**
     * 다수의 참여 정보를 병렬로 저장합니다
     */
    const saveJoins = useCallback(
        async (joins: JoinView[]): Promise<void> => {
            if (!joinDB || joins.length === 0) return;
            const tasks = joins.map(join => {
                if (join.id) return joinDB.save(join.id, join);
                return Promise.resolve();
            });
            await Promise.all(tasks);
        },
        [joinDB]
    );

    /**
     * 참여 정보를 로컬 DB에서 삭제합니다.
     */
    const deleteJoin = useCallback(
        async (id: string): Promise<void> => {
            if (joinDB) await joinDB.delete(id);
        },
        [joinDB]
    );

    return useMemo(
        () => ({
            cloudId,
            getJoin,
            getActiveJoinsByChannel,
            getJoinsByChannel,
            saveJoin,
            saveJoins,
            deleteJoin,
        }),
        [cloudId, getJoin, getActiveJoinsByChannel, getJoinsByChannel, saveJoin, saveJoins, deleteJoin]
    );
};
