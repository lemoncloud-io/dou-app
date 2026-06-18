import type { CloudDelegationTokenView, UserProfile$, UserTokenView } from '@lemoncloud/chatic-backend-api';
import type { OAuthLoginProvider } from '@chatic/app-messages';

export enum UserType {
    TEMP_ACCOUNT = 'temp_account',
    SOCIAL_NO_CLOUD = 'social_no_cloud',
    SOCIAL_WITH_CLOUD = 'social_with_cloud',
    INVITED = 'invited',
    INVITED_WITH_CLOUD = 'invited_with_cloud',
}

export interface UserPermissions {
    canCreateChannel: boolean;
    canCreatePlace: boolean;
    maxChannels: number;
    useCloudProfile: boolean;
    canSelectCloud: boolean;
}

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
        useCloudProfile: false,
        canSelectCloud: false,
    },
    [UserType.INVITED_WITH_CLOUD]: {
        canCreateChannel: true,
        canCreatePlace: true,
        useCloudProfile: true,
        canSelectCloud: true,
    },
};

const GUEST_MAX_CHANNELS = 3;
const MAX_CHANNELS_PER_PLACE = 100;

export const getUserType = (profile: UserProfile$ | null, isInvited: boolean, hasCloudToken: boolean): UserType => {
    const userRole = (profile?.$user as { userRole?: string })?.userRole;

    if (isInvited) {
        return userRole === 'user' ? UserType.INVITED_WITH_CLOUD : UserType.INVITED;
    }

    if (userRole === 'guest' && !hasCloudToken) {
        return UserType.TEMP_ACCOUNT;
    }

    if (userRole === 'user' && !hasCloudToken) {
        return UserType.SOCIAL_NO_CLOUD;
    }

    if (userRole === 'user' && hasCloudToken) {
        return UserType.SOCIAL_WITH_CLOUD;
    }

    return UserType.TEMP_ACCOUNT;
};

export const getPermissions = (userType: UserType): UserPermissions => {
    const basePermissions = DEFAULT_PERMISSIONS[userType];
    const maxChannels =
        userType === UserType.INVITED || userType === UserType.TEMP_ACCOUNT
            ? GUEST_MAX_CHANNELS
            : MAX_CHANNELS_PER_PLACE;

    return {
        ...basePermissions,
        maxChannels,
    };
};

export interface BaseServerContext {
    backend: string | null;
    wss: string | null;
    identityToken: string | null;
    siteId: string | null;
}

export interface RelayContext extends BaseServerContext {
    isAuthenticated: boolean;
}

export interface CloudContext extends BaseServerContext {
    cloudId: string | null;
    delegationToken: CloudDelegationTokenView | null;
    cloudToken: UserTokenView | null;
    isActive: boolean;
}

export interface IdentityContext {
    isInitialized: boolean;
    isAuthenticated: boolean;
    isOnMobileApp: boolean;
    error: Error | null;
    relayProfile: UserProfile$ | null;
    cloudProfile: UserProfile$ | null;
    activeProfile: UserProfile$ | null;
    userId: string | null;
    delegatorId: string | null;
    userRole: string | null;
    isInvited: boolean;
    isGuest: boolean;
    userName: string;
    oAuthProvider: OAuthLoginProvider | null;
    readonly userType: UserType;
    readonly permissions: UserPermissions;
}

export type ActiveServerContext =
    | {
          kind: 'relay';
          backend: string;
          wss: string;
          siteId: string | null;
          identityToken: string | null;
      }
    | {
          kind: 'cloud';
          cloudId: string;
          siteId: string | null;
          backend: string;
          wss: string;
          identityToken: string;
      };

export interface GlobalSessionContext {
    relay: RelayContext;
    cloud: CloudContext;
    identity: IdentityContext;
    activeServer: ActiveServerContext;
}

export interface CloudSessionSnapshot {
    cloudId: string;
    siteId: string | null;
    identityToken: string | null;
    backend: string | null;
    wss: string | null;
}

export type CloudSessionIssueTokenResult = {
    cloudDelegationToken: CloudDelegationTokenView;
    userToken: UserTokenView;
};
