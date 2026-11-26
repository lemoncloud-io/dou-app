import type { UserProfile$, UserView } from '@lemoncloud/chatic-backend-api';

import { isRefusedForEndedPairing } from '@chatic/auth';
import type {
    InviteLogin,
    LogoutOptions,
    OAuthCodeLoginOptions,
    PhoneLoginResult,
    SessionAccountView,
} from '@chatic/auth';
import { logger } from '@chatic/logger';
import type { SessionCommands } from '../../engine';

import { runtimeEngine } from '../init';
import { readSession } from './sessionReads';

export const sessionCommands = (): SessionCommands => runtimeEngine().commands;

const fireAndLog = (name: keyof SessionCommands, run: Promise<unknown>): void => {
    run.catch(error => logger.warn('SESSION', `[sessionCommands] ${name} failed`, { error }));
};

export const logoutSession = (options?: LogoutOptions): Promise<void> => sessionCommands().logout(options);

export const clearSiteSelection = (): void => fireAndLog('clearSiteSelection', sessionCommands().clearSiteSelection());

export const patchRelaySessionUser = (patch: Record<string, unknown>): void =>
    fireAndLog('patchRelayUser', sessionCommands().patchRelayUser(patch));

export const confirmPhoneLogin = (
    phone: string,
    code: string,
    options?: { countryCode?: string }
): Promise<PhoneLoginResult> => sessionCommands().confirmPhoneLogin(phone, code, options);

export const retryPhoneLogin = (): Promise<PhoneLoginResult> => sessionCommands().retryPhoneLogin();

export const cancelPhoneLogin = (): void => fireAndLog('cancelPhoneLogin', sessionCommands().cancelPhoneLogin());

export const createCredentialsByProvider = (
    provider = 'google',
    code: string,
    options?: OAuthCodeLoginOptions
): Promise<SessionAccountView> => sessionCommands().loginByOAuthCode(provider, code, options);

export const registerUserWithInviteCode = (code: string, delegatorId: string, backend?: string): Promise<InviteLogin> =>
    sessionCommands().loginWithInviteCode(code, delegatorId, backend);

export const forgetInviteLogin = (handle: string): void =>
    fireAndLog('forgetInviteLogin', sessionCommands().forgetInviteLogin(handle));

export const forgetRefusedPairedCloud = (cloudId: string, error: unknown): boolean => {
    if (!isRefusedForEndedPairing(error) || !readSession().pairing.cloudIds.includes(cloudId)) return false;
    fireAndLog('endPairedCloud', sessionCommands().endPairedCloud(cloudId));
    return true;
};

export const fetchAccountProfile = (): Promise<UserProfile$> => sessionCommands().fetchAccountProfile();

export const updateAccountProfile = (patch: { name?: string; photo?: string }): Promise<UserView> =>
    sessionCommands().updateAccountProfile(patch);
