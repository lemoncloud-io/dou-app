import { useCallback, useState } from 'react';
import { useWebSocketV2Store } from '@chatic/socket';
import type { InviteCloudView } from '@chatic/app-messages';
import { APP_SYNC_EVENT_NAME } from '../sync-events';
import type { AppSyncDetail } from '../sync-events';
import { useInviteRepository } from '../repository';

export const useInviteMutations = () => {
    const { cloudId } = useWebSocketV2Store();
    const repository = useInviteRepository(cloudId);

    const [isSaving, setIsSaving] = useState(false);

    /**
     * 초대장을 로컬 DB에 저장하고, 화면 갱신 이벤트를 방출합니다.
     */
    const saveInvite = useCallback(
        async (inviteData: InviteCloudView) => {
            setIsSaving(true);

            try {
                // 로컬 DB에 저장
                await repository.saveInvite(inviteData.id, inviteData);

                /**
                 * useInviteClouds가 감지할 수 있도록 이벤트 방출
                 * 서버를 거치지 않기 때문에 별도의 action이 존재하지 않음
                 */
                window.dispatchEvent(
                    new CustomEvent(APP_SYNC_EVENT_NAME, {
                        detail: {
                            domain: 'invitecloud',
                            action: '',
                            cid: cloudId,
                            targetId: inviteData.id,
                        } as AppSyncDetail,
                    })
                );
            } catch (error) {
                console.error('Failed to save invite:', error);
                throw error;
            } finally {
                setIsSaving(false);
            }
        },
        [repository, cloudId]
    );

    return {
        saveInvite,
        isSaving,
    };
};
