import type { OAuthLoginProvider } from '@chatic/app-messages';
import { storage } from '@chatic/shared';
import type { UserProfile$ } from '@lemoncloud/chatic-backend-api';

import { notifySessionStateChanged, readLocalJson, writeLocalJson } from '../utils';

const INVITED_SESSION_KEY = 'chatic-is-invited';
const OAUTH_PROVIDER_KEY = 'chatic-oauth-provider';
const RELAY_PROFILE_KEY = 'chatic-relay-profile-cache';
const CLOUD_PROFILE_KEY = 'chatic-cloud-profile-cache';
const DELEGATOR_ID_KEY = 'chatic-delegator-id';
const DEVICE_ID_KEY = 'chatic-device-id';
const REGISTERED_DEVICE_TOKEN_KEY = 'chatic-registered-device-token';
const IS_GUEST_KEY = 'chatic-is-guest';

interface IdentityCore {
    getIsInvited(): boolean;
    setIsInvited(value: boolean): void;
    getOAuthProvider(): OAuthLoginProvider | null;
    setOAuthProvider(provider: OAuthLoginProvider | null): void;
    getDelegatorId(): string | null;
    setDelegatorId(value: string | null): void;
    getDeviceId(): string | null;
    setDeviceId(value: string | null): void;
    getRegisteredDeviceToken(): string | null;
    setRegisteredDeviceToken(token: string | null): void;
    getRelayProfile(): UserProfile$ | null;
    setRelayProfile(profile: UserProfile$ | null): void;
    getCloudProfile(): UserProfile$ | null;
    setCloudProfile(profile: UserProfile$ | null): void;
    getIsGuest(): boolean;
    setIsGuest(value: boolean): void;
    clearIdentity(): void;
}

export const identityCore: IdentityCore = {
    getIsInvited: (): boolean => {
        try {
            if (localStorage.getItem(INVITED_SESSION_KEY) === 'true') return true;
        } catch {
            // ignore
        }
        return storage.get(INVITED_SESSION_KEY) === 'true';
    },
    setIsInvited: (value: boolean): void => {
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
        notifySessionStateChanged();
    },
    getOAuthProvider: (): OAuthLoginProvider | null => storage.get(OAUTH_PROVIDER_KEY) as OAuthLoginProvider | null,
    setOAuthProvider: (provider: OAuthLoginProvider | null): void => {
        if (provider) {
            storage.set(OAUTH_PROVIDER_KEY, provider);
        } else {
            storage.remove(OAUTH_PROVIDER_KEY);
        }
        notifySessionStateChanged();
    },
    getDelegatorId: (): string | null => storage.get(DELEGATOR_ID_KEY),
    setDelegatorId: (value: string | null): void => {
        if (value) {
            storage.set(DELEGATOR_ID_KEY, value);
        } else {
            storage.remove(DELEGATOR_ID_KEY);
        }
        notifySessionStateChanged();
    },
    getDeviceId: (): string | null => storage.get(DEVICE_ID_KEY),
    setDeviceId: (value: string | null): void => {
        if (value) {
            storage.set(DEVICE_ID_KEY, value);
        } else {
            storage.remove(DEVICE_ID_KEY);
        }
        notifySessionStateChanged();
    },
    getRegisteredDeviceToken: (): string | null => storage.get(REGISTERED_DEVICE_TOKEN_KEY),
    setRegisteredDeviceToken: (token: string | null): void => {
        if (token) {
            storage.set(REGISTERED_DEVICE_TOKEN_KEY, token);
        } else {
            storage.remove(REGISTERED_DEVICE_TOKEN_KEY);
        }
    },
    getRelayProfile: (): UserProfile$ | null => readLocalJson<UserProfile$>(RELAY_PROFILE_KEY),
    setRelayProfile: (profile: UserProfile$ | null): void => {
        writeLocalJson(RELAY_PROFILE_KEY, profile);
        notifySessionStateChanged();
    },
    getCloudProfile: (): UserProfile$ | null => readLocalJson<UserProfile$>(CLOUD_PROFILE_KEY),
    setCloudProfile: (profile: UserProfile$ | null): void => {
        writeLocalJson(CLOUD_PROFILE_KEY, profile);
        notifySessionStateChanged();
    },
    getIsGuest: (): boolean => {
        try {
            if (localStorage.getItem(IS_GUEST_KEY) === 'true') return true;
        } catch {
            // ignore
        }
        return false;
    },
    setIsGuest: (value: boolean): void => {
        if (value) {
            try {
                localStorage.setItem(IS_GUEST_KEY, 'true');
            } catch {
                // ignore
            }
        } else {
            try {
                localStorage.removeItem(IS_GUEST_KEY);
            } catch {
                // ignore
            }
        }
        notifySessionStateChanged();
    },
    clearIdentity: (): void => {
        storage.remove(INVITED_SESSION_KEY);
        storage.remove(OAUTH_PROVIDER_KEY);
        storage.remove(DELEGATOR_ID_KEY);
        writeLocalJson(RELAY_PROFILE_KEY, null);
        writeLocalJson(CLOUD_PROFILE_KEY, null);
        try {
            localStorage.removeItem(IS_GUEST_KEY);
        } catch {
            // ignore
        }
        notifySessionStateChanged();
    },
};
