import { WebCoreFactory } from '@lemoncloud/lemon-web-core';

import type { AxiosRequestConfig } from 'axios';

/**
 * The single `lemon-web-core` transport instance, its sealed boot, and the read-only session probes
 * that replace lemon's own refresh-triggering ones.
 *
 * **Why construction lives here.** ADR-0070 sketched `libs/http/src/adapters/lemonWebCore.ts` as the
 * home for everything lemon; the instance detoured through `@chatic/web-config` because it needs the
 * four env-derived constructor inputs and web-config was the only leaf both sides could bite. That
 * detour welded a live SDK instance, a token store and a module-load boot onto the repo's env leaf.
 * The `@chatic/*` 의존 0 contract never forbade *constructing* the instance here — only *reading* env
 * here — so the split is: this lib owns the construction and the boot policy, the assembly point
 * (`app-runtime/http/transport.ts`) owns the values and the singleton.
 *
 * **The sealed surface is now a type gate.** `SealedWebTransport` deliberately omits `init()`,
 * `isAuthenticated()` and `getTokenStorage()` — the three APIs that fire lemon-web-core's own HTTP
 * refresh or hand a caller the means to. That was ADR-0070 결정 2 불변조건 3, previously held up by
 * comments alone (web-config's exported interface still declared `init`/`isAuthenticated`). The token
 * storage stays captured in the closure below, reachable only by the sealed boot.
 */
export interface LemonTransportConfig {
    /** lemon project id. The caller applies any env suffixing before passing it. */
    project: string;
    oAuthEndpoint: string;
    region: string;
    /** `localStorage` or `sessionStorage` — the choice belongs to the caller (web-config). */
    storage: Storage;
}

export interface TransportRequestBuilder {
    setBody: (body: unknown) => TransportRequestBuilder;
    setParams: (params: Record<string, unknown>) => TransportRequestBuilder;
    execute: <T>() => Promise<{ data: T }>;
}

/** The refresh-free half of lemon's `WebTransport`. See the header: what is absent is the point. */
export interface SealedWebTransport {
    logout(): Promise<void>;
    setUseXLemonLanguage(enabled: boolean, key: string): Promise<void>;
    buildRequest(config: AxiosRequestConfig): TransportRequestBuilder;
    buildSignedRequest(config: AxiosRequestConfig): TransportRequestBuilder;
    buildCredentialsByToken(token: unknown): Promise<unknown>;
    getTokenSignature(): Promise<unknown>;
}

/** Lemon's token store, as far as the sealed boot needs it. Never leaves this module. */
interface LemonTokenStorage {
    /** Read-only: a relay token bundle (creds + identity token + expiry) is persisted. */
    hasCachedToken(): Promise<boolean>;
    /** Read-only: the persisted bundle is past lemon's refresh horizon (expired_time). */
    shouldRefreshToken(): Promise<boolean>;
    /** Seeds the lemon config keys (x-lemon-identity flag, region) — the non-auth half of init(). */
    initLemonConfig(): Promise<void>;
}

/** The raw instance `WebCoreFactory.create` returns, narrowed to what this module drives. */
export interface LemonWebTransport extends SealedWebTransport {
    /** Rebuilds the in-memory AWS credentials from the persisted store WITHOUT any refresh call. */
    buildCredentialsByStorage(): Promise<unknown>;
    getTokenStorage(): LemonTokenStorage;
}

export interface SealedWebTransportBundle {
    /** The transport itself, narrowed so no caller can reach a refresh-triggering API. */
    transport: SealedWebTransport;
    /**
     * `transport.init()` minus its internal refresh, single-flighted. Resolves once the lemon config
     * keys are seeded and the in-memory credentials are rebuilt from storage.
     */
    startInit(): Promise<void>;
    /** Test/logout seam — forces the next `startInit()` to run again. */
    resetInit(): void;
    /**
     * Read-only: whether a relay session bundle is persisted. This is the boot "am I logged in"
     * question — session EXISTENCE. Credential validity is deliberately not part of it: stale
     * credentials recover through the socket refresh writeback (or `requestRelaySessionRefresh`), and
     * flipping this to false on staleness would bounce a returning user to login over a recoverable
     * state.
     */
    hasStoredSession(): Promise<boolean>;
    /**
     * Read-only: whether the persisted credentials are past lemon's refresh horizon. Unlike
     * `isAuthenticated()` this NEVER fires a refresh — callers that find it true ask the refresh
     * owner instead (app-runtime `requestRelaySessionRefresh`).
     */
    isStoredSessionExpired(): Promise<boolean>;
}

/**
 * Seals an already-constructed lemon transport. Split from `createLemonWebTransport` so the boot
 * policy is unit-testable against a fake without reaching into the SDK.
 *
 * The boot replicates `init()` minus the refresh (2026-08 session audit §7 Phase 2-2): lemon's own
 * `init()`/`isAuthenticated()` fire an HTTP token refresh whenever the stored `expired_time` has
 * passed — a second refresh engine with no cap/single-flight that writes ONLY its own store, leaving
 * relayCore and the socket SDK's signing material stale (the signature-error divergence). Refresh
 * ownership belongs to the socket `AuthController`, whose writeback re-mints these credentials.
 */
export const sealLemonTransport = (transport: LemonWebTransport): SealedWebTransportBundle => {
    const runInit = async (): Promise<void> => {
        const tokenStorage = transport.getTokenStorage();
        await tokenStorage.initLemonConfig();
        if (!(await tokenStorage.hasCachedToken())) {
            return;
        }
        try {
            await transport.buildCredentialsByStorage();
        } catch {
            // Partial/corrupt store (e.g. missing AccessKeyId) — boot without in-memory credentials;
            // the next login/writeback rebuilds them.
        }
    };

    let pendingInit: Promise<void> | null = null;
    let initDone = false;

    return {
        transport,
        startInit: () => {
            if (initDone) return Promise.resolve();
            if (pendingInit) return pendingInit;
            pendingInit = runInit()
                .then(() => {
                    initDone = true;
                })
                .finally(() => {
                    pendingInit = null;
                });
            return pendingInit;
        },
        resetInit: () => {
            initDone = false;
            pendingInit = null;
        },
        hasStoredSession: () => transport.getTokenStorage().hasCachedToken(),
        isStoredSessionExpired: () => transport.getTokenStorage().shouldRefreshToken(),
    };
};

/**
 * Builds the lemon transport from plain config values and seals it. The caller owns the singleton —
 * two instances would split the token store, and this lib holds no module state by contract.
 */
export const createLemonWebTransport = (config: LemonTransportConfig): SealedWebTransportBundle =>
    sealLemonTransport(
        WebCoreFactory.create({
            cloud: 'aws',
            project: config.project,
            oAuthEndpoint: config.oAuthEndpoint,
            region: config.region,
            storage: config.storage,
        }) as unknown as LemonWebTransport
    );
