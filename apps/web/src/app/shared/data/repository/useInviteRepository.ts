import { useMemo, useCallback } from 'react';
import { createStorageAdapter } from '../local';
import { useWebSocketV2Store } from '@chatic/socket';
import type { InviteCloudView } from '@chatic/app-messages';

/**
 * 초대(Invite) 데이터의 로컬 영속성을 관리하는 리포지토리
 * 'invitecloud' 테이블을 사용하여 초대 코드 및 생성된 딥링크 정보를 저장합니다.
 */
export const useInviteRepository = () => {
    // Cloud 세션별 데이터 격리를 위한 ID 획득
    const cloudId = useWebSocketV2Store(s => s.cloudId) ?? 'default';

    // 초대 전용 스토리지 어댑터 (CacheType: 'invitecloud')
    const inviteDB = useMemo(
        () => (cloudId ? createStorageAdapter<InviteCloudView>('invitecloud', cloudId) : null),
        [cloudId]
    );

    /**
     * 특정 초대 정보를 로컬 DB에 저장합니다.
     */
    const saveInvite = useCallback(
        async (id: string, invite: InviteCloudView) => {
            if (inviteDB) await inviteDB.save(id, invite);
        },
        [inviteDB]
    );

    /**
     * 특정 ID(코드)를 가진 초대 정보를 불러옵니다.
     */
    const getInvite = useCallback(
        async (id: string) => {
            return inviteDB ? await inviteDB.load(id) : null;
        },
        [inviteDB]
    );

    /**
     * 로컬 DB에 저장된 모든 초대 목록을 가져옵니다.
     */
    const getInvites = useCallback(async (): Promise<InviteCloudView[]> => {
        if (!inviteDB) return [];
        return await inviteDB.loadAll();
    }, [inviteDB]);

    /**
     * 특정 초대 정보를 로컬 DB에서 삭제합니다.
     */
    const deleteInvite = useCallback(
        async (id: string) => {
            if (inviteDB) await inviteDB.delete(id);
        },
        [inviteDB]
    );

    return useMemo(
        () => ({
            cloudId,
            saveInvite,
            getInvite,
            getInvites,
            deleteInvite,
        }),
        [cloudId, saveInvite, getInvite, getInvites, deleteInvite]
    );
};
