import { useMemo, useCallback } from 'react';
import { createStorageAdapter } from '../storages';
import type { CacheChannelView } from '@chatic/app-messages';

/**
 * 채널 데이터의 영속성(Persistence)을 관리하는 리포지토리 훅
 * 로컬 DB(IndexedDB 등)와의 직접적인 CRUD 작업을 담당
 * @param profileUid 유저별 캐시 파티셔닝용 — default(중계서버) 모드에서만 유저별 캐시 분리
 */
export const useChannelRepository = (cloudId: string, profileUid?: string) => {
    const cid = cloudId === 'default' && profileUid ? `${cloudId}:${profileUid}` : cloudId;
    const channelDB = useMemo(() => (cloudId ? createStorageAdapter('channel', cid) : null), [cloudId, cid]);
    const joinDB = useMemo(() => (cloudId ? createStorageAdapter('join', cid) : null), [cloudId, cid]);

    /**
     * 모든 채널 목록을 로드
     */
    const getChannels = useCallback(async (): Promise<CacheChannelView[]> => {
        if (!channelDB) return [];
        return await channelDB.loadAll();
    }, [channelDB]);

    /**
     * 특정 플레이스(placeId/sid)에 속한 채널들만 필터링하여 로드
     */
    const getChannelsByPlace = useCallback(
        async (placeId: string): Promise<CacheChannelView[]> => {
            if (!channelDB) return [];
            const channels = await channelDB.loadAll();
            return channels.filter(ch => ch.sid === placeId);
        },
        [channelDB]
    );

    /**
     * 특정 ID를 가진 단일 채널 정보 로드
     */
    const getChannel = useCallback(
        async (id: string): Promise<CacheChannelView | null> => {
            if (!channelDB) return null;
            return await channelDB.load(id);
        },
        [channelDB]
    );

    /**
     * 채널 정보를 저장
     * 채널에 포함된 $join 정보가 있다면 joinDB 에도 동기화처리
     */
    const saveChannel = useCallback(
        async (id: string, channel: CacheChannelView): Promise<void> => {
            if (!channelDB) return;

            const tasks: Promise<unknown>[] = [channelDB.save(id, channel)];

            // $join 정보가 포함된 경우 joinDB에 별도 기록하여 업데이트 처리
            if (joinDB && channel.$join?.id) {
                tasks.push(joinDB.save(channel.$join.id, channel.$join));
            }
            await Promise.all(tasks);
        },
        [channelDB, joinDB]
    );

    /**
     * 채널 정보 삭제
     * 연관된 join 정보까지 함께 정리
     */
    const deleteChannel = useCallback(
        async (id: string): Promise<void> => {
            if (!channelDB) return;

            // 삭제 전 대상 채널의 join ID를 확인하여 동시 삭제 시도
            const channel = await channelDB.load(id);
            const tasks: Promise<void>[] = [channelDB.delete(id)];

            if (joinDB && channel?.$join?.id) {
                tasks.push(joinDB.delete(channel.$join.id));
            }
            await Promise.all(tasks);
        },
        [channelDB, joinDB]
    );

    return useMemo(
        () => ({
            cloudId,
            getChannels,
            getChannel,
            saveChannel,
            getChannelsByPlace,
            deleteChannel,
        }),
        [cloudId, getChannels, getChannelsByPlace, getChannel, saveChannel, deleteChannel]
    );
};
