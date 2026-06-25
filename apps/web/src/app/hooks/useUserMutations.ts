import { useCallback, useState } from 'react';

import type { MyInviteView, MyUserInviteBody } from '@lemoncloud/chatic-backend-api';
import type { UserInvitePayload, UserUpdateProfilePayload } from '@lemoncloud/chatic-sockets-api';
import { useSessionIdentity } from 'libs/web-core/src';

import { useRuntimeRepositories } from '@chatic/app-runtime';

type UserMutationAction = 'update-profile' | 'invite' | 'invite-batch';

/**
 * 사용자 정보 및 유저 관련 명령(초대 등)을 repository를 통해 서버에 전달하는 훅
 */
export const useUserMutations = () => {
    const { user: userRepository } = useRuntimeRepositories();
    const { activeProfile: profile } = useSessionIdentity();
    const myUserId = profile?.uid;

    const [pendingStates, setPendingStates] = useState<Record<UserMutationAction, boolean>>({
        'update-profile': false,
        invite: false,
        'invite-batch': false,
    });

    const withPending = useCallback(<T>(action: UserMutationAction, fn: () => Promise<T>): Promise<T> => {
        setPendingStates(prev => ({ ...prev, [action]: true }));
        return fn().finally(() => {
            setPendingStates(prev => ({ ...prev, [action]: false }));
        });
    }, []);

    const updateProfile = useCallback(
        (payload: UserUpdateProfilePayload): Promise<void> => {
            if (!myUserId) return Promise.reject(new Error('User ID is missing.'));
            return withPending('update-profile', () => userRepository.updateProfile(payload).then(() => undefined));
        },
        [myUserId, userRepository, withPending]
    );

    const requestInvite = useCallback(
        (payload: UserInvitePayload): Promise<MyInviteView> => {
            if (!payload.name) return Promise.reject(new Error('name is required'));
            if (!payload.phone) return Promise.reject(new Error('phone is required'));
            return withPending('invite', () => userRepository.requestInvite(payload));
        },
        [userRepository, withPending]
    );

    const requestInviteBatch = useCallback(
        (payload: MyUserInviteBody): Promise<MyInviteView[]> => {
            if (!payload.to || payload.to.length === 0) return Promise.reject(new Error('to is required'));
            return withPending('invite-batch', () => userRepository.requestInviteBatch(payload));
        },
        [userRepository, withPending]
    );

    return {
        isPending: pendingStates,
        updateProfile,
        requestInvite,
        requestInviteBatch,
    };
};
