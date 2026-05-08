import { useEffect, useState } from 'react';
import type { CacheCloudView } from '@chatic/app-messages';
import { getMobileAppInfo } from '@chatic/app-messages';
import { useRepositories } from '../data'; // 프로젝트 경로에 맞게 수정 필요

export const useInviteClouds = () => {
    const [inviteClouds, setInviteClouds] = useState<CacheCloudView[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const { isOnMobileApp } = getMobileAppInfo();
    const { inviteCloud } = useRepositories();

    useEffect(() => {
        if (!isOnMobileApp) return;

        setIsLoading(true);

        // Repository의 구독 메서드를 통해 초기 데이터 로드 및 이후 변경 사항을 자동 수신합니다.
        const unsubscribe = inviteCloud.subscribeInviteClouds((data: CacheCloudView[]) => {
            setInviteClouds(data);
            setIsLoading(false);
        });

        // 컴포넌트 언마운트 시 메모리 누수 방지를 위해 구독을 해제합니다.
        return () => {
            unsubscribe();
        };
    }, [isOnMobileApp, inviteCloud]);

    return {
        inviteClouds,
        isLoading,
    };
};
