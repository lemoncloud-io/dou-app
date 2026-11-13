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

/**
 * Everything a screen does to the session, as the engine takes it: signing in, moving between clouds
 * and places, signing out, and a pairing's steps. What a command changes, the session view shows — a
 * command answers only what the screen needs next, and never a token.
 *
 * Every command resolves only once its change is in the session view: a screen that awaits a switch and
 * then reads the session reads the session it switched to. The core commands get that for free — they
 * write this process's stores, and the view marks itself stale on the write, so the next read is new.
 * A runtime in another process has to hold the answer back until the snapshot that carries the change
 * has arrived.
 *
 * Every argument and answer is plain data, because a command may cross the bridge. Every command is
 * asynchronous for the same reason, even one that is not here.
 */
export interface SessionCommands {
    /** Signs in with a credential payload. `email` picks the email login over the id login. */
    loginUser(body: LoginUserBody, options?: { email?: boolean }): Promise<SessionAccountView>;
    /** Promotes the relay session with a native provider's verified token. */
    loginBySocialToken(body: VerifyNativeTokenBody, provider?: string | null): Promise<SessionAccountView>;
    /** Starts a guest session for this device. */
    loginGuestByDevice(deviceId: string): Promise<SessionAccountView>;
    /** Signs in with a provider's OAuth authorization code. */
    loginByOAuthCode(provider: string, code: string, options?: OAuthCodeLoginOptions): Promise<SessionAccountView>;
    /** Proves a phone code in login mode and signs this device in — one step. */
    confirmPhoneLogin(phone: string, code: string, options?: { countryCode?: string }): Promise<PhoneLoginResult>;
    /** Finishes a phone login whose code was proved but whose switch failed. */
    retryPhoneLogin(): Promise<PhoneLoginResult>;
    /** Drops a phone login waiting for its retry. */
    cancelPhoneLogin(): Promise<void>;
    /** Logs in to an invited cloud with the invite's code; answers with a handle to enter it with. */
    loginWithInviteCode(code: string, delegatorId: string, backend?: string): Promise<InviteLogin>;
    /** Drops an invite login the screen will not enter with. */
    forgetInviteLogin(handle: string): Promise<void>;

    /** Makes a cloud the active one — with an invite login's answer when one is named. */
    switchCloud(cloudId: string, options?: { inviteLogin?: InviteLogin }): Promise<void>;
    /** Moves the active session onto another place. */
    switchSite(siteId: string): Promise<void>;
    /** Empties the place selection without a switch — there is nothing left to switch to. */
    clearSiteSelection(): Promise<void>;

    /** Signs out of the relay session, which ends the session outright. */
    logout(options?: LogoutOptions): Promise<void>;
    /** Leaves the active cloud; the relay session stays. */
    logoutCloud(): Promise<void>;

    /** Writes fields of the account's own profile into the relay session. */
    patchRelayUser(patch: Record<string, unknown>): Promise<void>;
    /**
     * The account's own profile as the relay has it (`user.profile` on the relay slot), whichever cloud
     * is active — not the active session's, which inside a cloud is that cloud's user.
     */
    fetchAccountProfile(): Promise<UserProfile$>;
    /** Updates the account's own profile on the relay (`user.update`) and answers with the server's echo. */
    updateAccountProfile(patch: { name?: string; photo?: string }): Promise<UserView>;

    /** Claims a pairing this device asked for. A relay approval's session comes back as a handle. */
    claimPairing(pairingId: string): Promise<PairingClaimAnswer>;
    /** Signs this device in with the relay approval's session a claim's handle stands for. */
    applyPairingSession(sessionHandle: string): Promise<void>;
    /** Issues a cloud approval's tokens and remembers the cloud; the caller then switches to it. */
    preparePairedCloudEntry(cloudId: string): Promise<void>;
    /** Re-checks the paired clouds; answers the ones whose approval ended. */
    checkPairedClouds(): Promise<string[]>;
    /** Ends a paired cloud known to be over; answers whether it was a paired cloud. */
    endPairedCloud(cloudId: string): Promise<boolean>;
}

/**
 * An optional argument as the use case takes it. One that crossed the bridge left out arrives as `null`
 * — JSON has no `undefined` in an argument list — and a parameter default does not apply to `null`, so
 * `switchCloudSession(cloudId, null)` would destructure `null` and throw.
 */
const given = <T>(value: T | null | undefined): T | undefined => value ?? undefined;

/**
 * `user.*` pinned to the relay slot. Account screens need the relay account whichever cloud is active,
 * and not through a repository: a repository's cache is read under the live scope, so a relay row
 * written while a cloud is active would not be read back. The scoped client resolves its slot on each
 * call, and the command rejects when the relay slot is not bound.
 */
const relayAccount = () => createUserGateway(getSocketManager().getScopedClient(RELAY_SLOT) as never);

/**
 * The commands of the core engine: each runs the core packages' own use case, in this process.
 *
 * `async` throughout, so a command that is synchronous in the core (dropping a handle, a profile patch)
 * still answers the way a runtime in another process would — and a throw becomes a rejection.
 */
export const createCoreSessionCommands = (): SessionCommands => ({
    loginUser: async (body, options) =>
        withoutToken(await relaySession.loginUser({ body, email: given(options)?.email })),
    loginBySocialToken: async (body, provider) =>
        // The relay session types the provider as its own union; screens pass the shell's string.
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
