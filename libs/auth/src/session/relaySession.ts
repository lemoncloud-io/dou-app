import { logger } from '@chatic/logger';
import type { OAuthLoginProvider } from '@chatic/bridge-messages';
import type { UserTokenView } from '@lemoncloud/chatic-backend-api';
import type { VerifyNativeTokenBody } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';
import type { IAuthRepository } from '@chatic/data';

import { config } from '@chatic/config';

import { authRepositorySource } from './authRepository';
import {
    cloudStore,
    identityStore,
    relayStore,
    clearRelaySession,
    SECRET_LOGOUT_PENDING_KEY,
    DELEGATOR_ID_KEY,
    SESSION_KEYS,
    sessionStores,
    sessionSignal,
    setSessionAuthenticated,
    setSessionIdentityState,
} from '@chatic/session';
import { pairedClouds } from '../pairing/pairedClouds';
import { relayCredentialProbe } from './relayCredentialProbe';
import { dropSignedOutAppKeys } from './storage/signedOutAppKeys.util';
import { authPlatform } from '../platform';
import { isNativeStore, WebStore } from '@chatic/storage';
import { withoutToken } from './accountView';
import type { SessionAccountView } from './accountView';

export interface LogoutOptions {
    preserveUrl?: boolean;
}

export interface IRelaySession {
    initialize(): Promise<void>;
    persistDeviceId(deviceId: string): string;
    loginGuestByDevice(deviceId: string): Promise<UserTokenView>;
    loginUser(params: { body: Parameters<IAuthRepository['login']>[0]; email?: boolean }): Promise<UserTokenView>;
    loginByOAuthCode(provider: string, code: string, options?: OAuthCodeLoginOptions): Promise<UserTokenView>;
    loginBySocialToken(params: {
        body: VerifyNativeTokenBody;
        provider?: OAuthLoginProvider | null;
    }): Promise<UserTokenView>;
    loginByToken(tokenView: UserTokenView): Promise<UserTokenView>;
    clearAndRedirect(options?: LogoutOptions): Promise<void>;
    registerLogoutCallback(callback: () => void): () => void;
}

export interface OAuthCodeLoginOptions {
    linkCurrentSession?: boolean;
}

class RelaySession implements IRelaySession {
    private readonly logoutCallbacks = new Set<() => void>();

    private get repository(): IAuthRepository {
        return authRepositorySource.get();
    }

    private async apply(tokenView: UserTokenView): Promise<UserTokenView> {
        if (tokenView.Token) {
            relayStore.saveRelayToken(tokenView);
        }

        setSessionAuthenticated(true);
        return tokenView;
    }

    async initialize(): Promise<void> {
        setSessionIdentityState({
            isInitialized: false,
            error: null,
        });

        const isAuthenticated = relayCredentialProbe.hasSession();

        setSessionIdentityState({
            isInitialized: true,
            isAuthenticated,
        });
    }

    persistDeviceId(deviceId: string): string {
        identityStore.setDeviceId(deviceId);
        return deviceId;
    }

    async loginGuestByDevice(deviceId: string): Promise<UserTokenView> {
        this.persistDeviceId(deviceId);
        const tokenView = await this.repository.registerDevice(deviceId);

        const { Token: _token, ...view } = tokenView as UserTokenView & Record<string, unknown>;
        const uid = (view as { uid?: string; id?: string }).uid ?? (view as { id?: string }).id;
        if (uid) {
            identityStore.setDelegatorId(uid);
        }

        return await this.apply(tokenView);
    }

    async loginUser({
        body,
        email,
    }: {
        body: Parameters<IAuthRepository['login']>[0];
        email?: boolean;
    }): Promise<UserTokenView> {
        return await this.apply(await this.repository.login(body, email));
    }

    async loginByOAuthCode(
        provider = 'google',
        code: string,
        { linkCurrentSession = false }: OAuthCodeLoginOptions = {}
    ): Promise<UserTokenView> {
        const tokenView = linkCurrentSession
            ? await this.repository.verifyOAuthCode({ provider, code })
            : await this.repository.exchangeCode({ provider, code });

        if (!(tokenView as UserTokenView & { $auth?: { id?: string } }).$auth?.id) {
            logger.warn('AUTH', '[relaySession] OAuth exchange returned no $auth.id — relay socket cannot register', {
                data: { provider },
            });
        }

        return await this.apply(tokenView);
    }

    async loginBySocialToken({
        body,
    }: {
        body: VerifyNativeTokenBody;
        provider?: OAuthLoginProvider | null;
    }): Promise<UserTokenView> {
        const tokenView = await this.repository.verifyNativeToken(body);
        return await this.apply(tokenView);
    }

    async loginByToken(tokenView: UserTokenView): Promise<UserTokenView> {
        return await this.apply(tokenView);
    }

    async clearAndRedirect(options?: LogoutOptions): Promise<void> {
        const platform = authPlatform.ports();
        const searchBeforeCleanup = platform.currentSearch();

        this.logoutCallbacks.forEach(callback => {
            try {
                callback();
            } catch (error) {
                logger.error('AUTH', 'Logout callback error', { error });
            }
        });
        this.logoutCallbacks.clear();

        sessionSignal.batch(() => {
            cloudStore.clearSession();
            cloudStore.clearCachedCloudTokens();
            cloudStore.clearCloudIdentities();
            cloudStore.clearRecentClouds();
            cloudStore.clearReclaimedClouds();
            pairedClouds.clear();
            relayStore.clearSelectedSite();
            config.clear('net.relay.backend', { lane: 'local' });
            config.clear('net.relay.wss', { lane: 'local' });

            clearRelaySession();
        });

        dropSignedOutAppKeys(sessionStores.of('plain'));

        const secret = sessionStores.of('secret');
        if (isNativeStore(secret)) {
            [...SESSION_KEYS.secret, DELEGATOR_ID_KEY].forEach(key => WebStore.session().remove(key));
            secret.clear();
            try {
                await secret.flush();
            } catch (error) {
                logger.warn('AUTH', '[logout] the vault did not confirm it was emptied; the next boot will', { error });
                sessionStores.of('plain').set(SECRET_LOGOUT_PENDING_KEY, '1');
            }
        }

        const target = new URLSearchParams();
        if (options?.preserveUrl) {
            const params = new URLSearchParams(searchBeforeCleanup);
            for (const key of ['code', 'provider', '_backend', '_wss']) {
                const value = params.get(key);
                if (value) target.set(key, value);
            }
        }
        target.set('logout', '1');

        platform.leaveToHome(target);
    }

    registerLogoutCallback(callback: () => void): () => void {
        this.logoutCallbacks.add(callback);
        return () => this.logoutCallbacks.delete(callback);
    }
}

export const relaySession: IRelaySession = new RelaySession();

export const createCredentialsByProvider = async (
    provider = 'google',
    code: string,
    options?: OAuthCodeLoginOptions
): Promise<SessionAccountView> => withoutToken(await relaySession.loginByOAuthCode(provider, code, options));
export const registerSessionLogoutCallback = (callback: () => void): (() => void) =>
    relaySession.registerLogoutCallback(callback);
