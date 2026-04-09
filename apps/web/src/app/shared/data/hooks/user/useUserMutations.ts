import { useCallback, useState } from 'react';
import { useWebSocketV2 } from '@chatic/socket';
import { useWebCoreStore } from '@chatic/web-core';
import type { UserUpdateProfilePayload } from '@lemoncloud/chatic-sockets-api';

type UserMutationAction = 'updateProfile';

/**
 * 사용자 정보 변경 및 조회 명령을 서버에 전달
 * DB 갱신 이벤트가 발생할 때까지 대기하여 Promise를 반환하는 통합 Mutation 훅
 */
export const useUserMutations = () => {
    const { emitAuthenticated } = useWebSocketV2();
    const { isCloudUser } = useWebCoreStore();

    // 액션별 독립적인 Pending 상태 관리
    const [pendingStates, setPendingStates] = useState<Record<UserMutationAction, boolean>>({
        updateProfile: false,
    });

    /**
     * 상태 초기화 및 리스너 제거, 타이머 정리를 수행하는 클린업 함수
     */
    const cleanup = useCallback(
        (action: UserMutationAction, handler: (e: Event) => void, timeoutId: NodeJS.Timeout) => {
            setPendingStates(prev => ({ ...prev, [action]: false }));
            window.removeEventListener('local-db-updated', handler);
            clearTimeout(timeoutId);
        },
        []
    );

    /**
     * 내 프로필 정보 수정 요청
     * @returns 업데이트 완료 시 Promise.resolve
     */
    const updateProfile = useCallback(
        (payload: UserUpdateProfilePayload): Promise<void> => {
            return new Promise((resolve, reject) => {
                if (!isCloudUser) return reject(new Error('Guests cannot edit their profiles.'));

                const action: UserMutationAction = 'updateProfile';
                setPendingStates(prev => ({ ...prev, [action]: true }));

                // Sync 계층에서 유저 정보 업데이트 완료 이벤트를 받으면 로딩 해제 및 완료 처리
                const onUpdate = (e: Event) => {
                    const { detail } = e as CustomEvent;
                    if (detail.domain === 'user') {
                        cleanup(action, onUpdate, timeoutId);
                        resolve();
                    }
                };

                const timeoutId = setTimeout(() => {
                    cleanup(action, onUpdate, timeoutId);
                    reject(new Error('Profile Update Timeout'));
                }, 5000);

                window.addEventListener('local-db-updated', onUpdate);

                emitAuthenticated({
                    type: 'user',
                    action: 'update-profile',
                    payload,
                });
            });
        },
        [isCloudUser, emitAuthenticated, cleanup]
    );

    return {
        isPending: pendingStates,
        updateProfile,
    };
};
