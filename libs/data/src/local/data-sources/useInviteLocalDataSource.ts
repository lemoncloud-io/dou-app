import { useMemo, useCallback } from 'react';
import { createStorageAdapter } from '../storages';
import type { InviteCloudView } from '@chatic/app-messages';

/**
 * 초대 데이터의 로컬 영속성을 관리하는 리포지토리
 * 서버와의 연동 없이 로컬 DB(IndexedDB 등)와의 직접적인 입출력을 전담
 */
export const useInviteRepository = (cloudId: string) => {
    const inviteDB = useMemo(() => (cloudId ? createStorageAdapter('invitecloud', cloudId) : null), [cloudId]);

    /**
     * 특정 초대 정보를 로컬 DB에 저장
     */
    const saveInvite = useCallback(
        async (id: string, invite: InviteCloudView) => {
            if (inviteDB) await inviteDB.save(id, invite);
        },
        [inviteDB]
    );

    /**
     * 특정 ID(코드)를 가진 초대 정보 불러오기
     */
    const getInvite = useCallback(
        async (id: string) => {
            return inviteDB ? await inviteDB.load(id) : null;
        },
        [inviteDB]
    );

    /**
     * 로컬 DB에 저장된 모든 초대 목록 가져오기
     */
    const getInvites = useCallback(async (): Promise<InviteCloudView[]> => {
        if (!inviteDB) return [];
        return await inviteDB.loadAll();
    }, [inviteDB]);

    /**
     * 특정 초대 정보를 로컬 DB에서 삭제
     */
    const deleteInvite = useCallback(
        async (id: string) => {
            if (inviteDB) await inviteDB.delete(id);
        },
        [inviteDB]
    );

    const clearAll = useCallback(async (): Promise<void> => {
        inviteDB?.clearAll();
    }, [inviteDB]);

    return useMemo(
        () => ({
            cloudId,
            saveInvite,
            getInvite,
            getInvites,
            deleteInvite,
            clearAll,
        }),
        [cloudId, saveInvite, getInvite, getInvites, deleteInvite, clearAll]
    );
};
