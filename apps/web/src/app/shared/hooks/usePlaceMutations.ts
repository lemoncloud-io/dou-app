import { useCallback, useState } from 'react';

import type { MySiteView } from '@lemoncloud/chatic-backend-api';
import type { SiteView } from '@lemoncloud/chatic-socials-api';
import type { UserMakeSitePayload, UserUpdateSitePayload } from '@lemoncloud/chatic-sockets-api';

import { useRepositories } from '../data';

type PlaceMutationAction = 'make-site' | 'update-site';

/**
 * 플레이스(Site) 생성 및 수정을 repository를 통해 관리하는 훅
 */
export const usePlaceMutations = () => {
    const { site: siteRepository } = useRepositories();

    const [pendingStates, setPendingStates] = useState<Record<PlaceMutationAction, boolean>>({
        'make-site': false,
        'update-site': false,
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

    return {
        isPending: pendingStates,
        makeSite,
        updateSite,
    };
};
