import { useCallback, useState } from 'react';
import { useWebSocketV2 } from '@chatic/socket';
import { useDynamicProfile } from '@chatic/web-core';
import type { UserUpdateProfilePayload } from '@lemoncloud/chatic-sockets-api';
import { APP_SYNC_EVENT_NAME } from '../sync-events';
import type { AppSyncDetail } from '../sync-events';

type UserMutationAction = 'update-profile';

/**
 * 사용자 정보 변경 명령을 서버에 전달하고,
 * DB 갱신 이벤트가 발생할 때까지 대기하여 Promise를 반환하는 통합 Mutation 훅
 */
export const useUserMutations = () => {
    const { emitAuthenticated } = useWebSocketV2();
    const profile = useDynamicProfile();
    const myUserId = profile?.uid;

    const [pendingStates, setPendingStates] = useState<Record<UserMutationAction, boolean>>({
        'update-profile': false,
    });

    const cleanup = useCallback(
        (action: UserMutationAction, handler: (e: Event) => void, timeoutId: NodeJS.Timeout) => {
            setPendingStates(prev => ({ ...prev, [action]: false }));
            window.removeEventListener(APP_SYNC_EVENT_NAME, handler);
            clearTimeout(timeoutId);
        },
        []
    );

    /**
     * 내 프로필 정보 수정 요청 (user:update-profile)
     */
    const updateProfile = useCallback(
        (payload: UserUpdateProfilePayload): Promise<void> => {
            return new Promise((resolve, reject) => {
                if (!myUserId) return reject(new Error('User ID is missing.'));

                const action: UserMutationAction = 'update-profile';
                setPendingStates(prev => ({ ...prev, [action]: true }));

                const onUpdate = (e: Event) => {
                    const { detail } = e as CustomEvent<AppSyncDetail>;

                    if (
                        detail.domain === 'user' &&
                        detail.action === 'update-profile' &&
                        detail.targetId === myUserId
                    ) {
                        cleanup(action, onUpdate, timeoutId);
                        resolve();
                    }
                };

                const timeoutId = setTimeout(() => {
                    cleanup(action, onUpdate, timeoutId);
                    reject(new Error('Profile Update Timeout'));
                }, 5000);

                window.addEventListener(APP_SYNC_EVENT_NAME, onUpdate);

                emitAuthenticated({
                    type: 'user',
                    action: 'update-profile',
                    payload,
                });
            });
        },
        [myUserId, emitAuthenticated, cleanup]
    );

    return {
        isPending: pendingStates,
        updateProfile,
    };
};
