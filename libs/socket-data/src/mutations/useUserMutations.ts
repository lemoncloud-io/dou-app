import { useCallback, useState } from 'react';
import { useWebSocketV2 } from '@chatic/socket';
import { useDynamicProfile } from '@chatic/web-core';
import type { UserUpdateProfilePayload } from '@lemoncloud/chatic-sockets-api';
import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

import { APP_SYNC_EVENT_NAME } from '../sync-events';
import type { AppSyncDetail } from '../sync-events';
type UserMutationAction = 'update-profile' | 'invite';

export interface UserInvitePayload {
    channelId?: string;
    name: string;
    phone: string;
}

/**
 * 사용자 정보 및 유저 관련 명령(초대 등)을 서버에 전달하고,
 * 응답/갱신 이벤트가 발생할 때까지 대기하여 Promise를 반환하는 통합 Mutation 훅
 */
export const useUserMutations = () => {
    const { emitAuthenticated } = useWebSocketV2();
    const profile = useDynamicProfile();
    const myUserId = profile?.uid;

    const [pendingStates, setPendingStates] = useState<Record<UserMutationAction, boolean>>({
        'update-profile': false,
        invite: false,
    });

    const cleanup = useCallback(
        (action: UserMutationAction, handler?: (e: Event) => void, timeoutId?: NodeJS.Timeout) => {
            setPendingStates(prev => ({ ...prev, [action]: false }));
            if (handler) window.removeEventListener(APP_SYNC_EVENT_NAME, handler);
            if (timeoutId) clearTimeout(timeoutId);
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

    /**
     * 외부 유저(주소록 연락처) 초대 코드 요청 (user:invite)
     */
    const requestInvite = useCallback(
        (payload: UserInvitePayload): Promise<MyInviteView> => {
            return new Promise((resolve, reject) => {
                if (!payload.name) return reject(new Error('name is required'));
                if (!payload.phone) return reject(new Error('phone is required'));

                const action: UserMutationAction = 'invite';
                setPendingStates(prev => ({ ...prev, [action]: true }));

                const onUpdate = (e: Event) => {
                    const { detail } = e as CustomEvent<AppSyncDetail>;

                    // user 도메인의 invite 액션 이벤트 수신
                    if (detail.domain === 'user' && detail.action === 'invite') {
                        // 에러 응답인 경우 처리
                        if (detail.payload?.error || detail.payload?.message) {
                            cleanup(action, onUpdate, timeoutId);
                            reject(new Error(detail.payload?.message || 'user/invite error'));
                            return;
                        }

                        cleanup(action, onUpdate, timeoutId);
                        resolve(detail.payload as MyInviteView);
                    }
                };

                const timeoutId = setTimeout(() => {
                    cleanup(action, onUpdate, timeoutId);
                    reject(new Error('Invite request timed out'));
                }, 10000);

                window.addEventListener(APP_SYNC_EVENT_NAME, onUpdate);

                emitAuthenticated({
                    type: 'user',
                    action: 'invite',
                    payload,
                });
            });
        },
        [emitAuthenticated, cleanup]
    );

    return {
        isPending: pendingStates,
        updateProfile,
        requestInvite,
    };
};
