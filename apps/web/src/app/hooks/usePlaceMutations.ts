import { useCallback, useState } from 'react';

import type { MySiteView } from '@lemoncloud/chatic-backend-api';
import type { SiteView } from '@lemoncloud/chatic-socials-api';
import type { UserMakeSitePayload, UserUpdateSitePayload } from '@lemoncloud/chatic-sockets-api';
import type { DomainSite, LocalCacheBulkPatch } from '@chatic/data'; // DomainSite 및 LocalCacheBulkPatch 타입 임포트

import { useRuntimeRepositories } from '@chatic/app-runtime';

type PlaceMutationAction = 'make-site' | 'update-site' | 'update-place-order';

/**
 * 플레이스(Site) 생성 및 수정을 repository를 통해 관리하는 훅
 */
export const usePlaceMutations = () => {
    const { site: siteRepository } = useRuntimeRepositories();

    const [pendingStates, setPendingStates] = useState<Record<PlaceMutationAction, boolean>>({
        'make-site': false,
        'update-site': false,
        'update-place-order': false, // 플레이스 순서 변경을 위한 새로운 pending 상태 추가
    });

    const withPending = useCallback(<T>(action: PlaceMutationAction, fn: () => Promise<T>): Promise<T> => {
        setPendingStates(prev => ({ ...prev, [action]: true }));
        return fn().finally(() => {
            setPendingStates(prev => ({ ...prev, [action]: false }));
        });
    }, []);

    const makeSite = useCallback(
        (payload: UserMakeSitePayload): Promise<MySiteView> => {
            if (!payload.name) return Promise.reject(new Error('name is required'));
            return withPending('make-site', () =>
                siteRepository.createSite(payload).then((result: SiteView): MySiteView => result as MySiteView)
            );
        },
        [siteRepository, withPending]
    );

    const updateSite = useCallback(
        (payload: UserUpdateSitePayload): Promise<void> => {
            if (!payload.sid) return Promise.reject(new Error('sid is required'));
            return withPending('update-site', () => siteRepository.updateSite(payload).then(() => undefined));
        },
        [siteRepository, withPending]
    );

    /**
     * 플레이스들의 순서를 업데이트합니다.
     * @param placeIds - 새로운 순서로 정렬된 플레이스 ID 배열
     * @NOTE: SiteRepository의 cacheBulkUpdate를 사용하여 각 플레이스에 orderIndex를 업데이트합니다.
     *        이를 위해 DomainSite 타입에 'orderIndex?: number' 필드가 존재한다고 가정합니다.
     * @returns Promise<void>
     */
    const updatePlaceOrder = useCallback(
        (placeIds: string[]): Promise<void> => {
            const patches: LocalCacheBulkPatch<DomainSite>[] = placeIds.map((id, index) => ({
                id,
                patch: { order: index } as Partial<DomainSite>, // DomainSite에 orderIndex가 있다고 가정하고 패치 생성
            }));
            return withPending('update-place-order', () => siteRepository.cacheBulkUpdate(patches));
        },
        [siteRepository, withPending]
    );

    return {
        isPending: pendingStates,
        makeSite,
        updateSite,
        updatePlaceOrder, // 새로 추가된 순서 변경 함수를 반환
    };
};
