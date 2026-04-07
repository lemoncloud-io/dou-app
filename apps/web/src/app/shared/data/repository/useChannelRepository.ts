import { useMemo, useCallback } from 'react';
import { createStorageAdapter } from '../local'; // 로컬 스토리지를 제어하는 어댑터 생성 함수
import { useWebSocketV2Store } from '@chatic/socket';
import type { CacheChannelView } from '@chatic/app-messages';
import type { JoinView } from '@lemoncloud/chatic-socials-api';

/**
 * 채널 데이터의 영속성(Persistence)을 관리하는 리포지토리 훅
 * 로컬 DB(IndexedDB 등)와의 직접적인 CRUD 작업을 담당
 */
export const useChannelRepository = () => {
    const cloudId = useWebSocketV2Store(s => s.cloudId) ?? 'default';
    const channelDB = useMemo(
        () => (cloudId ? createStorageAdapter<CacheChannelView>('channel', cloudId) : null),
        [cloudId]
    );
    const joinDB = useMemo(() => (cloudId ? createStorageAdapter<JoinView>('join', cloudId) : null), [cloudId]);

    /**
     * 로컬 DB에 저장된 모든 채널 목록을 로드합니다.
     */
    const getChannels = useCallback(async (): Promise<CacheChannelView[]> => {
        if (!channelDB) return [];
        return await channelDB.loadAll();
    }, [channelDB]);

    /**
     * 특정 플레이스(placeId/sid)에 속한 채널들만 필터링하여 로드합니다.
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
     * 특정 ID를 가진 단일 채널 정보를 로드합니다.
     */
    const getChannel = useCallback(
        async (id: string): Promise<CacheChannelView | null> => {
            if (!channelDB) return null;
            return await channelDB.load(id);
        },
        [channelDB]
    );

    /**
     * 채널 정보를 로컬 DB에 저장합니다.
     * 채널 정보 내에 참여 정보($join)가 포함되어 있다면 joinDB에도 동시에 저장합니다.
     */
    const saveChannel: (id: string, channel: CacheChannelView) => Promise<void> = useCallback(
        async (id: string, channel: CacheChannelView): Promise<void> => {
            const tasks: Promise<void>[] = [];

            // 채널 기본 정보 저장 태스크 추가
            if (channelDB) {
                tasks.push(channelDB.save(id, channel));
            }

            // 참여 정보($join)가 존재할 경우 별도 테이블에 저장 태스크 추가
            if (joinDB && channel.$join && channel.$join.id) {
                tasks.push(joinDB.save(channel.$join.id, channel.$join));
            }
            await Promise.all(tasks);
        },
        [channelDB, joinDB]
    );

    /**
     * 로컬 DB에서 특정 채널 정보를 삭제합니다.
     */
    const deleteChannel = useCallback(
        async (id: string): Promise<void> => {
            const tasks: Promise<void>[] = [];

            if (channelDB) {
                tasks.push(channelDB.delete(id));
            }
            await Promise.all(tasks);
        },
        [channelDB]
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
