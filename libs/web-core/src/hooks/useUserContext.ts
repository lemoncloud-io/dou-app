import { useMemo } from 'react';

import { cloudCore, OAUTH_ENDPOINT } from '../core';
import { useWebCoreStore } from '../stores/useWebCoreStore';
import type { WSSType, UserContext, UserPermissions } from '../types/userContext';
import { UserType, DEFAULT_PERMISSIONS } from '../types/userContext';

import type { UserProfile$ } from '@lemoncloud/chatic-backend-api';

// 환경 변수
const VITE_WS_ENDPOINT = import.meta.env.VITE_WS_ENDPOINT || '';

// 제한값
const GUEST_MAX_CHANNELS = 3;
const MAX_CHANNELS_PER_PLACE = 100;

/**
 * UserType 계산
 *
 * 기존 isGuest, isInvited, isCloudUser를 UserType으로 변환합니다.
 */
const getUserType = (profile: UserProfile$ | null, isInvited: boolean, hasCloudToken: boolean): UserType => {
    if (!profile) {
        return UserType.TEMP_ACCOUNT;
    }

    const userRole = (profile.$user as { userRole?: string })?.userRole;

    // 케이스 4: 초대 유저
    if (isInvited) {
        return UserType.INVITED;
    }

    // 케이스 1: 순수 임시계정
    if (userRole === 'guest' && !hasCloudToken) {
        return UserType.TEMP_ACCOUNT;
    }

    // 케이스 2: 소셜 로그인 + cloud 선택 안함
    if (userRole === 'user' && !hasCloudToken) {
        return UserType.SOCIAL_NO_CLOUD;
    }

    // 케이스 3: 소셜 로그인 + cloud 선택함
    if (userRole === 'user' && hasCloudToken) {
        return UserType.SOCIAL_WITH_CLOUD;
    }

    // fallback: 임시계정으로 간주
    return UserType.TEMP_ACCOUNT;
};

/**
 * 현재 WSS 타입 결정
 *
 * cloudWSS 유무에 따라 어느 WSS를 사용할지 결정합니다.
 */
const getCurrentWSSType = (currentPlace: string | null, hasCloudWSS: boolean): WSSType => {
    // cloudWSS가 있으면 cloud WSS 사용
    if (hasCloudWSS) {
        return 'cloud';
    }

    // cloudWSS가 없으면 중계서버 WSS
    return 'relay';
};

/**
 * 권한 계산
 */
const getPermissions = (userType: UserType): UserPermissions => {
    const basePermissions = DEFAULT_PERMISSIONS[userType];

    // maxChannels 계산
    let maxChannels: number;
    if (userType === UserType.INVITED) {
        maxChannels = 0; // 초대 유저는 채널 생성 불가
    } else if (userType === UserType.TEMP_ACCOUNT) {
        maxChannels = GUEST_MAX_CHANNELS;
    } else {
        maxChannels = MAX_CHANNELS_PER_PLACE;
    }

    return {
        ...basePermissions,
        maxChannels,
    };
};

/**
 * useUserContext Hook
 *
 * 사용자의 현재 컨텍스트를 제공합니다.
 * 기존 isGuest, isInvited, isCloudUser를 대체합니다.
 */
export const useUserContext = (): UserContext => {
    const { profile, isInvited } = useWebCoreStore();

    // cloudCore 정보
    const cloudToken = cloudCore.getCloudToken();
    const cloudWSS = cloudCore.getWss();
    const cloudHTTP = cloudCore.getBackend();
    const currentPlace = cloudCore.getSelectedPlaceId();

    const hasCloudToken = !!cloudToken;
    const hasCloudWSS = !!cloudWSS;

    // UserType 계산
    const userType = useMemo(() => getUserType(profile, isInvited, hasCloudToken), [profile, isInvited, hasCloudToken]);

    // 현재 WSS 타입
    const currentWSS = useMemo(() => getCurrentWSSType(currentPlace, hasCloudWSS), [currentPlace, hasCloudWSS]);

    // 권한
    const permissions = useMemo(() => getPermissions(userType), [userType]);

    return {
        userType,
        currentWSS,
        currentPlace,
        endpoints: {
            relayWSS: VITE_WS_ENDPOINT,
            cloudWSS: cloudWSS,
            relayHTTP: OAUTH_ENDPOINT,
            cloudHTTP: cloudHTTP,
        },
        permissions,
    };
};

/**
 * Backward compatibility helpers
 *
 * 기존 코드에서 isGuest, isInvited, isCloudUser를 사용하는 곳을 위한 헬퍼
 */
export const useUserContextCompat = () => {
    const context = useUserContext();

    return {
        ...context,
        // 기존 boolean 값들 (deprecated)
        isGuest: context.userType === UserType.TEMP_ACCOUNT,
        isInvited: context.userType === UserType.INVITED,
        isCloudUser: context.userType === UserType.SOCIAL_WITH_CLOUD || context.userType === UserType.INVITED,
    };
};
