import type { OAuthLoginProvider } from '@chatic/app-messages';
import { storage } from '@chatic/shared';
import type { UserProfile$ } from '@lemoncloud/chatic-backend-api';

const INVITED_SESSION_KEY = 'chatic-is-invited';
const OAUTH_PROVIDER_KEY = 'chatic-oauth-provider';
const PROFILE_CACHE_KEY = 'chatic-profile-cache';
const DELEGATOR_ID_KEY = 'chatic-delegator-id';

export const getIsInvited = (): boolean => {
    try {
        if (localStorage.getItem(INVITED_SESSION_KEY) === 'true') return true;
    } catch {
        // ignore
    }
    return storage.get(INVITED_SESSION_KEY) === 'true';
};

export const setIsInvitedSession = (value: boolean): void => {
    if (value) {
        storage.set(INVITED_SESSION_KEY, 'true');
        try {
            localStorage.setItem(INVITED_SESSION_KEY, 'true');
        } catch {
            // ignore
        }
    } else {
        storage.remove(INVITED_SESSION_KEY);
        try {
            localStorage.removeItem(INVITED_SESSION_KEY);
        } catch {
            // ignore
        }
    }
};

export const getOAuthProvider = (): OAuthLoginProvider | null =>
    storage.get(OAUTH_PROVIDER_KEY) as OAuthLoginProvider | null;

export const setOAuthProvider = (provider: OAuthLoginProvider | null): void => {
    if (provider) {
        storage.set(OAUTH_PROVIDER_KEY, provider);
    } else {
        storage.remove(OAUTH_PROVIDER_KEY);
    }
};

export const getDelegatorId = (): string | null => storage.get(DELEGATOR_ID_KEY);

export const setDelegatorId = (value: string | null): void => {
    if (value) {
        storage.set(DELEGATOR_ID_KEY, value);
    } else {
        storage.remove(DELEGATOR_ID_KEY);
    }
};

export const readCachedProfile = (): UserProfile$ | null => {
    try {
        const cached = localStorage.getItem(PROFILE_CACHE_KEY);
        return cached ? (JSON.parse(cached) as UserProfile$) : null;
    } catch {
        return null;
    }
};

export const writeCachedProfile = (profile: UserProfile$ | null): void => {
    try {
        if (profile) {
            localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
        } else {
            localStorage.removeItem(PROFILE_CACHE_KEY);
        }
    } catch {
        // ignore
    }
};
