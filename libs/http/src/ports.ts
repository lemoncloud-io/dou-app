import type { HttpLogSink } from './log/networkLog';

/**
 * Which backend a request targets — an ENDPOINT key, not a signing strategy. All of these execute
 * through the lemon adapter; only 'relay' is ever signed.
 *
 * **There is no 'cloud' route.** A cloud backend is still a destination — `exchange-token` and the
 * invite lookups are sent to the host the delegation token names — but they ride `baseURL` and are
 * signed the RELAY way (or not at all). The one request that ever signed with the delegated cloud
 * credential was the cloud HTTP refresh, which ADR-0070 deleted; the SigV4 executor and the cloud
 * credential ports that served it went with it. Destination and signing are independent, which is
 * what lets a relay-signed request land on a cloud host.
 *
 * 'iap' is reserved — only `resolveEndpoint` uses it.
 */
export type HttpRoute = 'relay' | 'oauth' | 'iap';

export interface HttpRuntimePorts {
    /** Default host for a route when the caller does not pass an explicit `baseURL` override. */
    resolveEndpoint(route: HttpRoute): string;
    /**
     * Whether the route's SIGNING credential is already past its own expiry — read at the moment a
     * signed request fails, to decide whether a status-less failure was really a signature
     * rejection.
     *
     * Absent (or false) means the transport reports the failure exactly as it did before — this only
     * ever ADDS an explanation, never removes one.
     */
    isCredentialStale?(route: HttpRoute): boolean;
    /**
     * Re-mints the route's signing credential and reports whether the caller may retry. Only ever
     * called after `isCredentialStale` already explained a failure, and at most once per request.
     *
     * Absent means no recovery is wired and failures propagate unchanged.
     */
    recoverCredential?(route: HttpRoute): Promise<boolean>;
    /** Structured log sink. Absent (or a request `bypass: ['networkLog']`) means no logging. */
    logSink?: HttpLogSink;
    /** Called when `classifyError` marks a failure as requiring logout. Throwing here aborts the
     * caller's retry loop (see `policy/retry.ts` `RetryHooks.onAuthFailure`). */
    onAuthFailure?(error: unknown, message: string): void;
}
