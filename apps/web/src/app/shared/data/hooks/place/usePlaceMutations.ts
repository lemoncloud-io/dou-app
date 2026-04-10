import { useCallback, useState } from 'react';
import { useWebSocketV2 } from '@chatic/socket';
import { usePlaceRepository } from '../../repository';
import { cloudCore } from '@chatic/web-core';
import type { MySiteView } from '@lemoncloud/chatic-backend-api';
import type { AppSyncDetail } from '../../sync';
import { APP_SYNC_EVENT_NAME } from '../../sync';
import type { UserMakeSitePayload, UserUpdateSitePayload } from '@lemoncloud/chatic-sockets-api';

type PlaceMutationAction = 'make-site' | 'update-site';

/**
 * 플레이스(Site) 생성 및 수정을 관리 훅
 */
export const usePlaceMutations = () => {
    const cloudId = cloudCore.getSelectedCloudId() ?? 'default';
    const { emitAuthenticated } = useWebSocketV2();
    const repository = usePlaceRepository(cloudId);

    const [pendingStates, setPendingStates] = useState<Record<PlaceMutationAction, boolean>>({
        'make-site': false,
        'update-site': false,
    });

    const cleanup = useCallback(
        (action: PlaceMutationAction, handler: (e: Event) => void, timeoutId: NodeJS.Timeout) => {
            setPendingStates(prev => ({ ...prev, [action]: false }));
            window.removeEventListener(APP_SYNC_EVENT_NAME, handler);
            clearTimeout(timeoutId);
        },
        []
    );

    /**
     * 신규 플레이스 생성 (user:make-site)
     */
    const makeSite = useCallback(
        (payload: UserMakeSitePayload): Promise<MySiteView> => {
            if (!payload.name) return Promise.reject(new Error('name is required'));

            const action: PlaceMutationAction = 'make-site';
            setPendingStates(prev => ({ ...prev, [action]: true }));

            return new Promise((resolve, reject) => {
                const onUpdate = async (e: Event) => {
                    const { detail } = e as CustomEvent<AppSyncDetail>;

                    // 💡 userHandler가 방출하는 domain: 'site', action: 'make-site' 대기
                    if (detail.domain === 'site' && detail.action === 'make-site' && detail.targetId) {
                        cleanup(action, onUpdate, timeoutId);

                        const newSite = await repository.getPlace(detail.targetId);
                        if (newSite) {
                            const { cid, ...rest } = newSite as any;
                            resolve(rest as MySiteView);
                        } else {
                            reject(new Error('Site created but not found in local DB.'));
                        }
                    }
                };

                const timeoutId = setTimeout(() => {
                    cleanup(action, onUpdate, timeoutId);
                    reject(new Error('Site creation timeout.'));
                }, 10000);

                window.addEventListener(APP_SYNC_EVENT_NAME, onUpdate);
                emitAuthenticated({ type: 'user', action: 'make-site', payload });
            });
        },
        [emitAuthenticated, cleanup, repository]
    );

    /**
     * 플레이스 정보 수정 (user:update-site)
     */
    const updateSite = useCallback(
        (payload: UserUpdateSitePayload): Promise<void> => {
            if (!payload.sid) return Promise.reject(new Error('sid is required'));

            const action: PlaceMutationAction = 'update-site';
            setPendingStates(prev => ({ ...prev, [action]: true }));

            return new Promise((resolve, reject) => {
                const onUpdate = (e: Event) => {
                    const { detail } = e as CustomEvent<AppSyncDetail>;

                    if (
                        detail.domain === 'site' &&
                        detail.action === 'update-site' &&
                        detail.targetId === payload.sid
                    ) {
                        cleanup(action, onUpdate, timeoutId);
                        resolve();
                    }
                };

                const timeoutId = setTimeout(() => {
                    cleanup(action, onUpdate, timeoutId);
                    reject(new Error('Site update timeout.'));
                }, 5000);

                window.addEventListener(APP_SYNC_EVENT_NAME, onUpdate);
                emitAuthenticated({ type: 'user', action: 'update-site', payload });
            });
        },
        [emitAuthenticated, cleanup]
    );

    return {
        isPending: pendingStates,
        makeSite,
        updateSite,
    };
};
