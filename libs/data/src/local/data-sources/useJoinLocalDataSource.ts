import { useCallback, useMemo } from 'react';
import { createStorageAdapter } from '../storages';
import type { JoinView } from '@lemoncloud/chatic-socials-api';

/**
 * 채널 참여 정보(Join)의 로컬 영속성을 관리하는 리포지토리
 * 서버와의 연동 없이 로컬 DB(IndexedDB 등)와의 직접적인 입출력을 전담
 * @param profileUid 유저별 캐시 파티셔닝용 — default(중계서버) 모드에서만 유저별 캐시 분리
 */
export const useJoinLocalDataSource = (cloudId: string, profileUid?: string) => {
    const cid = cloudId === 'default' && profileUid ? `${cloudId}:${profileUid}` : cloudId;
    const joinDB = useMemo(() => (cloudId ? createStorageAdapter('join', cid) : null), [cloudId, cid]);

    const getJoins = useCallback(async (): Promise<JoinView[]> => {
        if (!joinDB) return [];
        return await joinDB.loadAll();
    }, [joinDB]);

    /**
     * 특정 채널에서 현재 참여 중인 정보만 필터링하여 반환
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
     * 특정 채널의 모든 참여 정보(나간 사람 포함) 반환
     */
    const getJoinsByChannel = useCallback(
        async (channelId: string): Promise<JoinView[]> => {
            if (!joinDB) return [];
            const joins = await joinDB.loadAll();
            return joins.filter(j => j.channelId === channelId);
        },
        [joinDB]
    );

    /**
     * 참여 아이디를 통한 참여정보 불러오기
     */
    const getJoin = useCallback(
        async (id: string): Promise<JoinView | null> => {
            return joinDB ? await joinDB.load(id) : null;
        },
        [joinDB]
    );

    /**
     * 참여 데이터 저장
     */
    const saveJoin = useCallback(
        async (id: string, join: JoinView): Promise<void> => {
            if (joinDB) await joinDB.save(id, join);
        },
        [joinDB]
    );

    /**
     * 다수의 참여 정보를 병렬로 저장
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
     * 참여 정보를 로컬 DB에서 삭제
     */
    const deleteJoin = useCallback(
        async (id: string): Promise<void> => {
            if (joinDB) await joinDB.delete(id);
        },
        [joinDB]
    );

    const clearAll = useCallback(async (): Promise<void> => {
        joinDB?.clearAll();
    }, [joinDB]);

    return useMemo(
        () => ({
            cloudId,
            getJoins,
            getJoin,
            getActiveJoinsByChannel,
            getJoinsByChannel,
            saveJoin,
            saveJoins,
            deleteJoin,
            clearAll,
        }),
        [
            cloudId,
            getJoins,
            getJoin,
            getActiveJoinsByChannel,
            getJoinsByChannel,
            saveJoin,
            saveJoins,
            deleteJoin,
            clearAll,
        ]
    );
};
