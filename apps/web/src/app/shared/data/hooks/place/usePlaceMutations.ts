import { useCallback, useState } from 'react';
import { useWebSocketV2 } from '@chatic/socket';
import { usePlaceRepository } from '../../repository';
import type { MySiteView } from '@lemoncloud/chatic-backend-api';
import type { UserUpdateSitePayload } from '@lemoncloud/chatic-sockets-api';

type PlaceMutationAction = 'create' | 'update';

/**
 * 워크스페이스(Place) 생성 및 수정 명령을 서버 하달
 * Sync 데몬이 로컬 DB에 반영을 완료할 때까지 대기하여 결과(Promise)를 반환하는 통합 Mutation 훅
 */
export const usePlaceMutations = () => {
    const { emitAuthenticated } = useWebSocketV2();
    const repository = usePlaceRepository();

    const [pendingStates, setPendingStates] = useState<Record<PlaceMutationAction, boolean>>({
        create: false,
        update: false,
    });

    /**
     * 로딩 상태를 해제하고 이벤트 리스너 및 타임아웃을 안전하게 정리하는 공통 클린업 함수
     */
    const cleanup = useCallback(
        (action: PlaceMutationAction, handler: (e: Event) => void, timeoutId: NodeJS.Timeout) => {
            setPendingStates(prev => ({ ...prev, [action]: false }));
            window.removeEventListener('local-db-updated', handler);
            clearTimeout(timeoutId);
        },
        []
    );

    /**
     * 새로운 워크스페이스(Place) 생성 요청
     */
    const createPlace = useCallback(
        (name: string): Promise<MySiteView> => {
            const action: PlaceMutationAction = 'create';
            setPendingStates(prev => ({ ...prev, [action]: true }));

            return new Promise((resolve, reject) => {
                const handleUpdate = async (e: Event) => {
                    const { detail } = e as CustomEvent;

                    if (detail.domain === 'user' && detail.subDomain === 'place' && detail.targetSiteId) {
                        cleanup(action, handleUpdate, timeoutId);

                        const newPlace = await repository.getPlace(detail.targetSiteId);
                        if (newPlace) {
                            resolve(newPlace);
                        } else {
                            reject(new Error('Place created but not found in DB'));
                        }
                    }
                };

                const timeoutId = setTimeout(() => {
                    cleanup(action, handleUpdate, timeoutId);
                    reject(new Error('createPlace timeout (서버 무응답)'));
                }, 10000);

                window.addEventListener('local-db-updated', handleUpdate);

                emitAuthenticated({
                    type: 'user',
                    action: 'make-site',
                    payload: { name, stereo: 'work' },
                });
            });
        },
        [emitAuthenticated, repository, cleanup]
    );

    /**
     * 기존 워크스페이스(Place) 정보 수정 요청
     */
    const updatePlace = useCallback(
        (payload: UserUpdateSitePayload): Promise<MySiteView> => {
            const action: PlaceMutationAction = 'update';
            setPendingStates(prev => ({ ...prev, [action]: true }));

            return new Promise((resolve, reject) => {
                const handleUpdate = async (e: Event) => {
                    const { detail } = e as CustomEvent;

                    if (
                        detail.domain === 'user' &&
                        detail.subDomain === 'place' &&
                        detail.targetSiteId === payload.id
                    ) {
                        cleanup(action, handleUpdate, timeoutId);

                        const updatedPlace = await repository.getPlace(detail.targetSiteId);
                        if (updatedPlace) {
                            resolve(updatedPlace);
                        } else {
                            reject(new Error('Place updated but not found in DB'));
                        }
                    }
                };

                const timeoutId = setTimeout(() => {
                    cleanup(action, handleUpdate, timeoutId);
                    reject(new Error('updatePlace timeout (서버 무응답)'));
                }, 10000);

                window.addEventListener('local-db-updated', handleUpdate);

                emitAuthenticated({
                    type: 'user',
                    action: 'update-site',
                    payload,
                });
            });
        },
        [emitAuthenticated, repository, cleanup]
    );

    return {
        createPlace,
        updatePlace,
        isPending: pendingStates,
    };
};
