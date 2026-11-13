import { isRefusedForEndedPairing } from '@chatic/auth';
import type {
    InviteLogin,
    LogoutOptions,
    OAuthCodeLoginOptions,
    PhoneLoginResult,
    SessionAccountView,
} from '@chatic/auth';
import { logger } from '@chatic/logger';
import type { SessionCommands } from '@chatic/runtime-core';

import { runtimeEngine } from '../init';
import { readSession } from './sessionReads';

// What the app does to the session, through the engine it was handed — never the core packages
// directly. On the phone the session may live in another process, and the engine is what knows where;
// in a page that owns the session the core engine runs this process's own use cases.

/** The engine's session commands — for the hooks of this package, which wrap them for React. */
export const sessionCommands = (): SessionCommands => runtimeEngine().commands;

/**
 * Runs a command whose caller does not wait for it — an effect's cleanup, a write the screen already
 * shows — and says when it fails, since nobody else will.
 */
const fireAndLog = (name: keyof SessionCommands, run: Promise<unknown>): void => {
    run.catch(error => logger.warn('SESSION', `[sessionCommands] ${name} failed`, { error }));
};

/** Signs out of the relay session: the socket told first, then the local teardown and redirect. */
export const logoutSession = (options?: LogoutOptions): Promise<void> => sessionCommands().logout(options);

/**
 * Empties the place selection without a switch — for a cloud whose last place the user just left,
 * where there is nothing to switch to.
 */
export const clearSiteSelection = (): void => fireAndLog('clearSiteSelection', sessionCommands().clearSiteSelection());

/** Writes fields of the account's own profile into the relay session; `getRelaySessionUser` reads them. */
export const patchRelaySessionUser = (patch: Record<string, unknown>): void =>
    fireAndLog('patchRelayUser', sessionCommands().patchRelayUser(patch));

/** Proves a phone code in login mode and signs this device in. The session token stays with the runtime. */
export const confirmPhoneLogin = (
    phone: string,
    code: string,
    options?: { countryCode?: string }
): Promise<PhoneLoginResult> => sessionCommands().confirmPhoneLogin(phone, code, options);

/** Finishes a phone login whose code was proved but whose switch failed. */
export const retryPhoneLogin = (): Promise<PhoneLoginResult> => sessionCommands().retryPhoneLogin();

/** Drops a phone login waiting for its retry — the phone screens call it when they close. */
export const cancelPhoneLogin = (): void => fireAndLog('cancelPhoneLogin', sessionCommands().cancelPhoneLogin());

/**
 * Signs in with a provider's OAuth code and answers with the account's fields. Not a hook: its caller is
 * an OAuth redirect page's effect.
 */
export const createCredentialsByProvider = (
    provider = 'google',
    code: string,
    options?: OAuthCodeLoginOptions
): Promise<SessionAccountView> => sessionCommands().loginByOAuthCode(provider, code, options);

/** Logs in to an invited cloud with the invite's code; answers with the handle `switchCloud` enters with. */
export const registerUserWithInviteCode = (code: string, delegatorId: string, backend?: string): Promise<InviteLogin> =>
    sessionCommands().loginWithInviteCode(code, delegatorId, backend);

/** Drops an invite login the screen will not enter with. */
export const forgetInviteLogin = (handle: string): void =>
    fireAndLog('forgetInviteLogin', sessionCommands().forgetInviteLogin(handle));

/**
 * Ends a paired cloud whose delegation was refused over an ended pairing, so the switch sheet stops
 * offering it. Answers at once whether it did: the refusal is read here, and whether the cloud is a
 * paired one comes from the session the screen already shows — the ending itself is the runtime's.
 */
export const forgetRefusedPairedCloud = (cloudId: string, error: unknown): boolean => {
    if (!isRefusedForEndedPairing(error) || !readSession().pairing.cloudIds.includes(cloudId)) return false;
    fireAndLog('endPairedCloud', sessionCommands().endPairedCloud(cloudId));
    return true;
};
