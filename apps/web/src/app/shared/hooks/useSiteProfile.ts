import { useCallback, useState } from 'react';

import type { SiteProfileBody, SiteProfileView } from '@chatic/data';

import { useRepositories } from '../data';

type SiteProfileAction = 'get-site-profile' | 'set-site-profile';

/**
 * 현재 place의 사이트 프로필(닉네임 등)을 조회/수정하는 훅.
 * 서버 응답 즉시 state를 갱신하여 UI에 반영합니다.
 */
export const useSiteProfile = () => {
    const { user: userRepository } = useRepositories();

    const [siteProfile, setSiteProfile] = useState<SiteProfileView | null>(null);

    const [pendingStates, setPendingStates] = useState<Record<SiteProfileAction, boolean>>({
        'get-site-profile': false,
        'set-site-profile': false,
    });

    const withPending = useCallback(<T>(action: SiteProfileAction, fn: () => Promise<T>): Promise<T> => {
        setPendingStates(prev => ({ ...prev, [action]: true }));
        return fn().finally(() => {
            setPendingStates(prev => ({ ...prev, [action]: false }));
        });
    }, []);

    const fetchSiteProfile = useCallback((): Promise<SiteProfileView> => {
        return withPending('get-site-profile', async () => {
            const result = await userRepository.getSiteProfile();
            setSiteProfile(result);
            return result;
        });
    }, [userRepository, withPending]);

    const updateSiteProfile = useCallback(
        (body: SiteProfileBody): Promise<SiteProfileView> => {
            return withPending('set-site-profile', async () => {
                const result = await userRepository.setSiteProfile(body);
                setSiteProfile(result);
                return result;
            });
        },
        [userRepository, withPending]
    );

    return {
        siteProfile,
        isPending: pendingStates,
        fetchSiteProfile,
        updateSiteProfile,
    };
};
