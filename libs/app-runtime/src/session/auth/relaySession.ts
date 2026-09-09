import { logger } from '@chatic/bridges';
import type { OAuthLoginProvider } from '@chatic/app-messages';
import type { UserTokenView } from '@lemoncloud/chatic-backend-api';
import type { VerifyNativeTokenBody } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';
import type { IAuthRepositoryV2 } from '@chatic/data';

import { config } from '@chatic/config';

import { getRepositories } from '../../data/runtime';
import {
    hasStoredRelaySession,
    resetWebTransportInit,
    startWebTransportInit,
    webTransport,
} from '../../http/transport';
import { cloudStore, identityStore, relayStore } from '../store/stores';
import { clearRelaySession, sessionSignal, setSessionAuthenticated, setSessionIdentityState } from '../store';
// NOTE: everything above comes from `../store` (the concrete module), not the session barrel — the
// session barrel now publishes only the app surface (ADR-0076 결정 6).

// `ServerKind` and the Auth SDK bridge moved to `sessionAuthAdapter` (ADR-0076 결정 5). Re-exported
// here for the barrel's type surface only — the bridge itself is not re-exported.
export type { ServerKind } from './sessionAuthAdapter';

export interface LogoutOptions {
    preserveUrl?: boolean;
}

/** i18next's own localStorage key name — not a setting, just where it happens to keep the language. */
const LANGUAGE_KEY = 'i18nextLng';

/**
 * The RELAY half of the session hub's use-cases (ADR-0076 결정 5) — booting the relay session,
 * the five ways into it, and the teardown out of it. `./cloudSession` is the other half.
 *
 * **Why the teardown lives on the RELAY class.** `clearAndRedirect` clears cloud stores too, which
 * reads asymmetric next to `CloudSession.clearStores`. It is not: relay is the root identity that a
 * cloud session is delegated from, so dropping relay ends the session outright, while dropping cloud
 * leaves relay as the baseline to re-enter from. The blast radius follows the credential asymmetry
 * (`socket/auth/renewers.ts`), not the file layout.
 *
 * `IRelaySession` / `RelaySession` with no suffix, like `ActiveScope` and `CloudSession`: `*Service`
 * has zero precedent in this repo's libs and `*Manager` is reserved for ADR-0070's four engines.
 *
 * Every HTTP call here goes through `data`, not through a gateway. `session/auth` used to hold the
 * `OAuthHttpGateway` itself — the last place outside `data` that talked to a gateway directly. It now
 * reaches the same actions through `AuthRepositoryV2`, so there is exactly one path from this runtime
 * to an HTTP gateway and it runs through the data layer (ADR-0036 gateway 예외 폐지 · ADR-0070 결정 5).
 * What did NOT change is who owns session material: the repository performs the calls and never
 * interprets what comes back. Installing a token stays this class's job alone.
 */
export interface IRelaySession {
    /** Boots relay transport and resolves the initial authentication state. Never refreshes. */
    initialize(): Promise<void>;
    /** Persists the device identifier used by later login and restore flows. Returns it back. */
    persistDeviceId(deviceId: string): string;
    /** Creates a guest session from a device id. The only path that sets `delegatorId`. */
    loginGuestByDevice(deviceId: string): Promise<UserTokenView>;
    /** Logs in with a credential payload. */
    loginUser(params: { body: Parameters<IAuthRepositoryV2['login']>[0]; email?: boolean }): Promise<UserTokenView>;
    /** Exchanges an OAuth authorization code for a session. */
    loginByOAuthCode(provider: string, code: string): Promise<UserTokenView>;
    /** Promotes the active session with a verified native social token. */
    loginBySocialToken(params: {
        body: VerifyNativeTokenBody;
        provider?: OAuthLoginProvider | null;
    }): Promise<UserTokenView>;
    /** Applies an ALREADY-ISSUED token view — the socket-login case, where there is no HTTP call. */
    loginByToken(tokenView: UserTokenView): Promise<UserTokenView>;
    /** FULL local teardown + redirect. NOT the app-facing logout — see the method doc. */
    clearAndRedirect(options?: LogoutOptions): Promise<void>;
    /** Registers a callback invoked once during teardown. Returns the unregister. */
    registerLogoutCallback(callback: () => void): () => void;
}

class RelaySession implements IRelaySession {
    private readonly logoutCallbacks = new Set<() => void>();

    /**
     * `getRepositories()` (not the `useRuntimeRepositories` hook) because this class is not React —
     * the same accessor `socket/sync/plans.ts` uses. Resolved per action, so import order never
     * matters.
     *
     * **Endpoint note.** `web-core/api/users.ts` pinned `delegate-cloud` / `verify-native-token` to
     * the STATIC build-time host (`getCoreEndpoint()` → `VITE_DOU_ENDPOINT`), while every other relay
     * call — and the socket — honored the dynamic resolver (`?_backend=` deeplink override →
     * `window.DOU_ENDPOINT` → env). The gateways use the dynamic resolver throughout, so those two
     * actions follow the override like everything else. Identical in normal operation (both read the
     * same env value); the difference only shows in a deeplinked dev/QA session, where honoring the
     * override is the point.
     */
    private get repository(): IAuthRepositoryV2 {
        return getRepositories().auth;
    }

    /**
     * Applies a relay token view as the active session: builds AWS credentials, persists the token
     * (the auth anchor + uid/profile-seed source), and marks the session authenticated. Profile
     * shaping is gone — profile facts are tracked from the token + user cache by app-runtime's
     * useRuntimeProfile.
     *
     * Note: this deliberately does NOT touch delegatorId. delegatorId is set once at guest login and
     * must survive every relay refresh / cloud switch that also runs through here, so it is owned by
     * `loginGuestByDevice` (set) and `clearRelaySession` (cleared on relay logout) only.
     */
    private async apply(tokenView: UserTokenView): Promise<UserTokenView> {
        if (tokenView.Token) {
            await webTransport.buildCredentialsByToken(tokenView.Token);
            relayStore.saveRelayToken(tokenView);
        }

        setSessionAuthenticated(true);
        return tokenView;
    }

    /**
     * The auth flag is a READ-ONLY session-existence probe (hasStoredRelaySession), not the old
     * `webTransport.isAuthenticated()` — that call fired lemon-web-core's own HTTP refresh on a stale
     * boot, a second refresh engine that updated only the lemon store and left relayStore/the socket
     * SDK's signing material stale (audit §1 "토큰 사본 3벌"). Boot now never refreshes: stale
     * credentials are rebuilt by the socket AuthController's refresh writeback once the socket
     * re-verifies (or by an explicit requestRelaySessionRefresh). A returning user with expired
     * credentials therefore boots into the logged-in UI instead of being treated as logged out —
     * including on an offline boot, where the old refresh probe always failed.
     */
    async initialize(): Promise<void> {
        setSessionIdentityState({
            isInitialized: false,
            error: null,
        });

        logger.debug('WEB_CORE', '[initialize] awaiting relay transport init');
        await startWebTransportInit();
        logger.debug('WEB_CORE', '[initialize] relay transport init done, setting language + probing session');
        const [, isAuthenticated] = await Promise.all([
            webTransport.setUseXLemonLanguage(true, LANGUAGE_KEY),
            hasStoredRelaySession(),
        ]);

        setSessionIdentityState({
            isInitialized: true,
            isAuthenticated,
        });
    }

    /**
     * Writes through `identityStore` only. It used to ALSO write the same `chatic-device-id` key
     * straight to `localStorage`, which nothing read: the store writes through the `storage` adapter
     * (sessionStorage on the web, localStorage inside a native/desktop shell) and the reader is
     * `useDynamicDeviceId` → `useSessionDeviceId('chatic-device-id')`, which reads sessionStorage. So
     * the raw write landed in a slot with no reader on the web and duplicated the store's write
     * inside a shell.
     *
     * Whether the web's device id SHOULD be per-tab-session is a separate open question (ADR-0076
     * §열린 질문 4) — it is load-bearing because push registration and socket identity must share
     * one id.
     */
    persistDeviceId(deviceId: string): string {
        identityStore.setDeviceId(deviceId);
        return deviceId;
    }

    async loginGuestByDevice(deviceId: string): Promise<UserTokenView> {
        this.persistDeviceId(deviceId);
        const tokenView = await this.repository.registerDevice(deviceId);

        // A fresh guest session delegates as its own uid for invite acceptance. Set delegatorId ONCE
        // here: it must persist across relay refreshes / cloud switches / cloud logout, and is only
        // replaced by the next guest login (a relay logout clears it via clearRelaySession).
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
        body: Parameters<IAuthRepositoryV2['login']>[0];
        email?: boolean;
    }): Promise<UserTokenView> {
        return await this.apply(await this.repository.login(body, email));
    }

    /**
     * Same shape as every other login here: the login endpoint answers with a full relay token view
     * and `apply` commits it. It used to be the odd one out — it kept only `Token`, threw the rest
     * away, and left the caller to recover the discarded fields by calling the REFRESH endpoint a
     * moment later. That was the last HTTP refresh in the codebase (ADR-0070 불변조건 1·2).
     */
    async loginByOAuthCode(provider = 'google', code: string): Promise<UserTokenView> {
        const tokenView = await this.repository.exchangeCode({ provider, code });

        // The relay socket registers with `$auth.id` (signServerAuth) and it is not obtainable from
        // the profile endpoint — if a login response ever stops carrying it the failure surfaces
        // later as a socket auth error, so say it here where the cause is still visible.
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
        // `provider` is still accepted for caller compatibility but no longer stored — the OAuth
        // provider is no longer session state (native OAuth logout is an app/bridge concern; see
        // `clearAndRedirect`).
        provider?: OAuthLoginProvider | null;
    }): Promise<UserTokenView> {
        const tokenView = await this.repository.verifyNativeToken(body);
        return await this.apply(tokenView);
    }

    /**
     * The socket-login case (`auth.verify-hash-alias` step=check returns `$token` over the websocket,
     * so there is no HTTP login call to run here). Same commit as the other login paths: rebuild AWS
     * credentials, persist the token, mark authenticated. Like the social promotion, it does NOT
     * touch delegatorId — that stays owned by `loginGuestByDevice` / `clearRelaySession`.
     *
     * Refreshing the live SOCKET identity is not done here; `socket/auth/applySessionToken` owns that
     * and calls this first so the store leads and the socket follows.
     */
    async loginByToken(tokenView: UserTokenView): Promise<UserTokenView> {
        return await this.apply(tokenView);
    }

    /**
     * The FULL local session teardown + redirect: relay token, cloud stores, lemon transport state
     * and selection all go, then the document reloads at `/`. **Not the app-facing logout** — that is
     * `socket/auth/logoutSession`, which notifies both sockets first and then calls this.
     *
     * Named for what it clears (the whole session, not just relay) and for the redirect, because the
     * store-level [`clearRelaySession`](../store/contextStore.ts) is a DIFFERENT and much smaller
     * operation — it drops the relay token and rebuilds identity, nothing else. An earlier pass
     * called this `clearRelaySessionLocal`, one suffix away from that one; a near-collision is the
     * weak form of the very defect 결정 7 removed.
     *
     * It used to be called `logoutRelaySession`, one of two same-named pairs inside this package: the
     * root barrel published THIS (socket-silent) half while the docs declared the socket half the
     * public one, and `apps/admin-v2` really did call the silent half. ADR-0070 §맥락 named that
     * failure mode for the pre-merge `web-core`/`app-runtime` barrels and ADR-0076 결정 7 closes it
     * here — the weak halves lose their global names so the collision cannot be re-created.
     */
    async clearAndRedirect(options?: LogoutOptions): Promise<void> {
        const searchBeforeCleanup = window.location.search;

        // No server-side logout: there is no backend session-revoke endpoint (the old POST
        // /users/logout always 403'd because it was unsigned, and it was never authoritative). Logout
        // is purely a LOCAL teardown — clear the relay/cloud tokens + credentials + selection below.
        // The socket auth session is ended separately by the caller's best-effort socket
        // `auth.logout` (socket/auth/logoutSession).

        this.logoutCallbacks.forEach(callback => {
            try {
                callback();
            } catch (error) {
                logger.error('AUTH', 'Logout callback error', { error });
            }
        });
        this.logoutCallbacks.clear();

        // Native OAuth logout is no longer handled here: the OAuth provider is no longer session
        // state. A native shell that needs to sign out of the provider SDK should register that via
        // `registerLogoutCallback` (it owns the provider it logged in with).
        await webTransport.logout();

        // The whole store teardown is ONE observable change (ADR-0076 결정 2). Every write inside
        // announces its own kind — `cloud:token` + `selection` from `clearSession`, `selection` from
        // `clearSelectedSite`, `relay:token` + `identity` from `clearRelaySession` — so the batch is
        // what keeps observers from re-rendering through a half-torn-down session on the way to the
        // redirect.
        sessionSignal.batch(() => {
            cloudStore.clearSession();
            relayStore.clearSelectedSite();
            // Replaces `clearRelayTransportOverrides()` — drop the deeplinked `?_backend`/`?_wss`
            // local overrides so a future boot resolves the build's own endpoint again instead of
            // staying pinned to whatever a stray link set. `net.oauth.endpoint` has no local lane to
            // clear (ADR-0079 결정 10 — that override was already dead, nothing read it).
            config.clear('net.relay.backend', { lane: 'local' });
            config.clear('net.relay.wss', { lane: 'local' });
            resetWebTransportInit();

            // Cloud tokens were dropped by cloudStore.clearSession() above; clearRelaySession drops
            // the relay token and rebuilds identity as unauthenticated (uid → null).
            clearRelaySession();
        });

        // Land on home directly. `/auth/login` is only a shim that forwards to `/` (see apps/web
        // LoginPage), so routing through it just added a redirect hop. We also do NOT rewind the
        // history stack: back-navigating into an authenticated URL is already handled by the router,
        // which falls unauthenticated paths back to `/` (see apps/web PublicRoutes).
        //
        // `logout=1` must survive onto the target: webTransport reads it from the freshly loaded
        // document's query string to wipe the persisted `@`-prefixed storage keys.
        const targetUrl = new URL('/', window.location.origin);
        if (options?.preserveUrl) {
            const params = new URLSearchParams(searchBeforeCleanup);
            for (const key of ['code', 'provider', '_backend', '_wss']) {
                const value = params.get(key);
                if (value) targetUrl.searchParams.set(key, value);
            }
        }
        targetUrl.searchParams.set('logout', '1');

        window.location.replace(targetUrl.toString());
    }

    registerLogoutCallback(callback: () => void): () => void {
        this.logoutCallbacks.add(callback);
        return () => this.logoutCallbacks.delete(callback);
    }
}

/**
 * Holds only the logout-callback registry, which is process-wide by nature (a native shell registers
 * its provider sign-out once at boot) — so one instance serves the whole app, like `cloudSession`.
 */
export const relaySession: IRelaySession = new RelaySession();

/**
 * The two APP-FACING names, and only those.
 *
 * Everything else reaches the class through `relaySession` directly, because the repo's own pattern
 * for an `I*` + class + singleton module is to export the singleton and nothing else
 * (`credentialRecovery` · `credentialFreshness` · `sessionAuthAdapter` all do). A fleet of
 * name-preserving wrappers was the anomaly, not the convention — it existed only so this
 * refactor's consumer migration could be a pure path rename, and that migration is done.
 *
 * These two stay because their callers are apps, and an app should not hold a singleton: the OAuth
 * exchange runs in a redirect page's effect and the logout-callback registry is wired at a log
 * uploader's module init — neither is React, so neither can go through a hook (결정 6).
 */
export const createCredentialsByProvider = (provider = 'google', code: string): Promise<UserTokenView> =>
    relaySession.loginByOAuthCode(provider, code);
export const registerSessionLogoutCallback = (callback: () => void): (() => void) =>
    relaySession.registerLogoutCallback(callback);
