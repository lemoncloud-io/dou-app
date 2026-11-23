import type { LoginUserBody, UserProfile$, UserView } from '@lemoncloud/chatic-backend-api';
import { createUserGateway } from '@lemoncloud/chatic-sockets-lib';
import type { VerifyNativeTokenBody } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';

import {
    applyPairingSession,
    cancelPhoneLogin,
    checkPairedClouds,
    clearSiteSelection,
    confirmPhoneLogin,
    endPairedCloud,
    forgetInviteLogin,
    holdPairingClaim,
    logoutCloudSession,
    logoutSession,
    pairedCloudSessions,
    registerUserWithInviteCode,
    relaySession,
    retryPhoneLogin,
    switchCloudSession,
    switchSite,
    withoutToken,
} from '@chatic/auth';
import type {
    InviteLogin,
    LogoutOptions,
    OAuthCodeLoginOptions,
    PairingClaimAnswer,
    PhoneLoginResult,
    SessionAccountView,
} from '@chatic/auth';
import { patchRelaySessionUser } from '@chatic/session';
import { RELAY_SLOT, getSocketManager } from '@chatic/transport';

import { getRepositories } from '../data/runtime';

export interface SessionCommands {
    loginUser(body: LoginUserBody, options?: { email?: boolean }): Promise<SessionAccountView>;
    loginBySocialToken(body: VerifyNativeTokenBody, provider?: string | null): Promise<SessionAccountView>;
    loginGuestByDevice(deviceId: string): Promise<SessionAccountView>;
    loginByOAuthCode(provider: string, code: string, options?: OAuthCodeLoginOptions): Promise<SessionAccountView>;
    confirmPhoneLogin(phone: string, code: string, options?: { countryCode?: string }): Promise<PhoneLoginResult>;
    retryPhoneLogin(): Promise<PhoneLoginResult>;
    cancelPhoneLogin(): Promise<void>;
    loginWithInviteCode(code: string, delegatorId: string, backend?: string): Promise<InviteLogin>;
    forgetInviteLogin(handle: string): Promise<void>;

    switchCloud(cloudId: string, options?: { inviteLogin?: InviteLogin }): Promise<void>;
    switchSite(siteId: string): Promise<void>;
    clearSiteSelection(): Promise<void>;

    logout(options?: LogoutOptions): Promise<void>;
    logoutCloud(): Promise<void>;

    patchRelayUser(patch: Record<string, unknown>): Promise<void>;
    fetchAccountProfile(): Promise<UserProfile$>;
    updateAccountProfile(patch: { name?: string; photo?: string }): Promise<UserView>;

    claimPairing(pairingId: string): Promise<PairingClaimAnswer>;
    applyPairingSession(sessionHandle: string): Promise<void>;
    preparePairedCloudEntry(cloudId: string): Promise<void>;
    checkPairedClouds(): Promise<string[]>;
    endPairedCloud(cloudId: string): Promise<boolean>;
}

const given = <T>(value: T | null | undefined): T | undefined => value ?? undefined;

const relayAccount = () => createUserGateway(getSocketManager().getScopedClient(RELAY_SLOT) as never);

export const createCoreSessionCommands = (): SessionCommands => ({
    loginUser: async (body, options) =>
        withoutToken(await relaySession.loginUser({ body, email: given(options)?.email })),
    loginBySocialToken: async (body, provider) =>
        withoutToken(await relaySession.loginBySocialToken({ body, provider: provider as never })),
    loginGuestByDevice: async deviceId => withoutToken(await relaySession.loginGuestByDevice(deviceId)),
    loginByOAuthCode: async (provider, code, options) =>
        withoutToken(await relaySession.loginByOAuthCode(provider, code, given(options))),
    confirmPhoneLogin: (phone, code, options) => confirmPhoneLogin(phone, code, given(options)),
    retryPhoneLogin: () => retryPhoneLogin(),
    cancelPhoneLogin: async () => cancelPhoneLogin(),
    loginWithInviteCode: (code, delegatorId, backend) => registerUserWithInviteCode(code, delegatorId, given(backend)),
    forgetInviteLogin: async handle => forgetInviteLogin(handle),

    switchCloud: (cloudId, options) => switchCloudSession(cloudId, given(options)),
    switchSite: siteId => switchSite(siteId),
    clearSiteSelection: async () => clearSiteSelection(),

    logout: options => logoutSession(given(options)),
    logoutCloud: () => logoutCloudSession(),

    patchRelayUser: async patch => patchRelaySessionUser(patch),
    fetchAccountProfile: async () => relayAccount().profile<UserProfile$>(),
    updateAccountProfile: async patch => relayAccount().update<UserView>(patch as never),

    claimPairing: async pairingId => holdPairingClaim(await getRepositories().pairing.claimPairing(pairingId)),
    applyPairingSession: sessionHandle => applyPairingSession(sessionHandle),
    preparePairedCloudEntry: cloudId => pairedCloudSessions.prepareEntry(cloudId),
    checkPairedClouds: () => checkPairedClouds(),
    endPairedCloud: async cloudId => endPairedCloud(cloudId),
});
