import { useCallback, useState } from 'react';
import { logger } from '@chatic/bridges';
import { useRepositories } from '../data';
import type { DomainInviteCloud } from '@chatic/data';

export const useInviteMutations = () => {
    // DataSource 대신 Repository 인스턴스를 가져옵니다.
    const { inviteCloud } = useRepositories();

    const [isSaving, setIsSaving] = useState(false);

    /**
     * 초대장을 로컬 DB에 저장하고, 화면 갱신 이벤트를 방출합니다.
     */
    const saveInvite = useCallback(
        async (inviteData: DomainInviteCloud) => {
            setIsSaving(true);

            try {
                // Repository의 saveInviteCloud 메서드 사용
                await inviteCloud.saveInviteCloud(inviteData.id, inviteData);
            } catch (error) {
                logger.error('INVITE', 'Failed to save invite', { error, data: { inviteId: inviteData.id } });
                throw error;
            } finally {
                setIsSaving(false);
            }
        },
        [inviteCloud]
    );

    return {
        saveInvite,
        isSaving,
    };
};
