import { isNative } from '@chatic/bridges';
import type { UserProfile$ } from '@lemoncloud/chatic-backend-api';

import { cloudCore } from '../core/cloudCore';
import { sessionContextStore } from './contextStore';
import {
    getDelegatorId,
    getIsInvited,
    getOAuthProvider,
    setDelegatorId,
    writeCachedProfile,
} from './sessionPersistence';
import { notifySessionStateChanged } from './utils';
import type { IdentityContext } from './types';
import { getPermissions, getUserType } from './types';

interface UserViewExtended {
    userRole?: string;
}

type SessionIdentityState = Pick<
    IdentityContext,
    'isInitialized' | 'isAuthenticated' | 'isOnMobileApp' | 'error' | 'profile'
>;

const buildIdentityContext = (state: SessionIdentityState): IdentityContext => {
    const profile = state.profile;
    const isInvited = getIsInvited();
    const userRole = (profile?.$user as { userRole?: string } | undefined)?.userRole ?? null;
    const isGuest = userRole === 'guest' && !isInvited;
    const isCloudUser = isInvited || userRole === 'user';
    const userType = getUserType(profile, isInvited, !!cloudCore.getCloudToken());

    return {
        ...state,
        userId: profile?.uid ?? null,
        delegatorId: getDelegatorId(),
        userRole,
        isInvited,
        isGuest,
        isCloudUser,
        userName: profile?.$user?.name || 'Unknown',
        oAuthProvider: getOAuthProvider(),
        userType,
        permissions: getPermissions(userType),
    };
};

const readSessionIdentityState = (): SessionIdentityState => {
    const identity = sessionContextStore.getIdentityContext();
    return {
        isInitialized: identity.isInitialized,
        isAuthenticated: identity.isAuthenticated,
        isOnMobileApp: identity.isOnMobileApp,
        error: identity.error,
        profile: identity.profile,
    };
};

export const getSessionIdentityContext = (): IdentityContext => sessionContextStore.getIdentityContext();

export const getSessionAuthSnapshot = () => {
    const { isInitialized, isAuthenticated, isOnMobileApp, error, profile } = getSessionIdentityContext();
    return { isInitialized, isAuthenticated, isOnMobileApp, error, profile };
};

export const setSessionAuthenticated = (isAuthenticated: boolean): void => {
    const state = readSessionIdentityState();
    sessionContextStore.setIdentityState(buildIdentityContext({ ...state, isAuthenticated }));
    notifySessionStateChanged();
};

export const setSessionProfile = (profile: UserProfile$): void => {
    writeCachedProfile(profile);
    const userRoleGuest = (profile.$user as UserViewExtended)?.userRole === 'guest';
    if (userRoleGuest && profile.uid) {
        setDelegatorId(profile.uid);
    }
    const state = readSessionIdentityState();
    sessionContextStore.setIdentityState(buildIdentityContext({ ...state, isAuthenticated: true, profile }));
    notifySessionStateChanged();
};

export const clearSessionProfile = (): void => {
    writeCachedProfile(null);
    const state = readSessionIdentityState();
    sessionContextStore.setIdentityState(buildIdentityContext({ ...state, isAuthenticated: false, profile: null }));
    notifySessionStateChanged();
};

export const setSessionIdentityState = (partial: Partial<SessionIdentityState>): void => {
    const state = readSessionIdentityState();
    if (partial.profile !== undefined) {
        if (partial.profile) {
            setSessionProfile(partial.profile);
            return;
        }
        clearSessionProfile();
        return;
    }
    sessionContextStore.setIdentityState(
        buildIdentityContext({
            isInitialized: partial.isInitialized ?? state.isInitialized,
            isAuthenticated: partial.isAuthenticated ?? state.isAuthenticated,
            isOnMobileApp: partial.isOnMobileApp ?? state.isOnMobileApp,
            error: partial.error !== undefined ? partial.error : state.error,
            profile: state.profile,
        })
    );
    notifySessionStateChanged();
};

export const markSessionInitialized = (): void => {
    const state = readSessionIdentityState();
    sessionContextStore.setIdentityState(buildIdentityContext({ ...state, isInitialized: true }));
    notifySessionStateChanged();
};

sessionContextStore.setIdentityState(
    buildIdentityContext({
        isInitialized: false,
        isAuthenticated: !!sessionContextStore.getIdentityContext().profile,
        isOnMobileApp: isNative(),
        error: null,
        profile: sessionContextStore.getIdentityContext().profile,
    })
);
