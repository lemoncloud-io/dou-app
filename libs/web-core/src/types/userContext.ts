/**
 * User Type Enum
 *
 * 사용자의 인증 및 cloud 연결 상태를 명확하게 구분합니다.
 */
export enum UserType {
    /**
     * 케이스 1: 순수 임시계정
     * - deviceId로 자동 로그인
     * - userRole='guest', cloud 없음
     * - 중계서버 WSS/HTTP만 사용
     */
    TEMP_ACCOUNT = 'temp_account',

    /**
     * 케이스 2: 소셜 로그인 + cloud 선택 안함
     * - 소셜 로그인 완료 (userRole='user')
     * - cloud 선택 안함 (자동 생성 안됨)
     * - 중계서버 WSS/HTTP만 사용
     */
    SOCIAL_NO_CLOUD = 'social_no_cloud',

    /**
     * 케이스 3: 소셜 로그인 + cloud 선택함
     * - 소셜 로그인 완료 (userRole='user')
     * - cloud 선택함 (cloudCore에 정보 있음)
     * - cloud WSS/HTTP 사용
     */
    SOCIAL_WITH_CLOUD = 'social_with_cloud',

    /**
     * 케이스 4: 초대 유저
     * - 초대 링크로 들어옴 (isInvited=true)
     * - userRole='guest'
     * - 초대받은 cloud 정보 있음
     * - cloud WSS + 중계서버 WSS 둘 다 필요
     */
    INVITED = 'invited',
}

/**
 * WSS Connection Type
 */
export type WSSType = 'relay' | 'cloud';

/**
 * User Context
 *
 * 사용자의 현재 컨텍스트 (연결 상태, 권한 등)를 통합 관리합니다.
 */
export interface UserContext {
    /**
     * 사용자 타입
     */
    userType: UserType;

    /**
     * 현재 활성화된 WSS 연결
     */
    currentWSS: WSSType;

    /**
     * 현재 선택된 place ID
     * - null: 중계서버 채팅 (나만의 채팅)
     * - DEFAULT_PLACE_ID: 기본 place
     * - other: cloud place
     */
    currentPlace: string | null;

    /**
     * WSS 엔드포인트
     */
    endpoints: {
        relayWSS: string; // 중계서버 WSS (VITE_WS_ENDPOINT)
        cloudWSS: string | null; // cloud WSS (cloudCore.getWss())
        relayHTTP: string; // 중계서버 HTTP (OAUTH_ENDPOINT)
        cloudHTTP: string | null; // cloud HTTP (cloudCore.getBackend())
    };

    /**
     * 권한
     */
    permissions: UserPermissions;
}

/**
 * User Permissions
 *
 * 사용자 타입별 권한을 명확하게 정의합니다.
 */
export interface UserPermissions {
    /**
     * 채널 생성 가능 여부
     */
    canCreateChannel: boolean;

    /**
     * place 생성 가능 여부
     */
    canCreatePlace: boolean;

    /**
     * 최대 채널 생성 개수
     */
    maxChannels: number;

    /**
     * cloud 프로필 사용 여부
     */
    useCloudProfile: boolean;

    /**
     * cloud 선택 가능 여부
     */
    canSelectCloud: boolean;
}

/**
 * 사용자 타입별 기본 권한 정의
 */
export const DEFAULT_PERMISSIONS: Record<UserType, Omit<UserPermissions, 'maxChannels'>> = {
    [UserType.TEMP_ACCOUNT]: {
        canCreateChannel: true,
        canCreatePlace: false,
        useCloudProfile: false,
        canSelectCloud: true,
    },
    [UserType.SOCIAL_NO_CLOUD]: {
        canCreateChannel: true,
        canCreatePlace: false,
        useCloudProfile: false,
        canSelectCloud: true,
    },
    [UserType.SOCIAL_WITH_CLOUD]: {
        canCreateChannel: true,
        canCreatePlace: true,
        useCloudProfile: true,
        canSelectCloud: true,
    },
    [UserType.INVITED]: {
        canCreateChannel: false,
        canCreatePlace: false,
        useCloudProfile: true,
        canSelectCloud: false, // 초대받은 cloud만 사용 가능
    },
};
