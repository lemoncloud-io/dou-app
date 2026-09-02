import { staleCredentialMarker } from './credentialStale';
import { isBrowserOffline } from '../utils/browserNetwork';

import type { IStaleCredentialMarker } from './credentialStale';
import type { HttpRoute, HttpRuntimePorts } from '../ports';

/**
 * Which credential SIGNS a request, so a failure can be attributed to the right one.
 *
 * Not the same question as `HttpRequestOptions.baseURL`'s host: `exchangeCode` signs with the relay
 * credential while targeting the oauth host. And `signed: false` matters as much as the route — an
 * UNSIGNED relay call cannot fail for a lapsed credential, so it must never be attributed to one.
 */
export interface SigningContext {
    route: HttpRoute;
    signed: boolean;
}

export interface IFailureAttributor {
    /** Returns the error to throw — the original one, stamped when a lapsed credential explains it. */
    attribute(error: unknown, ctx: SigningContext): unknown;
}

/**
 * Decides whether a failed request is a signature rejection, and stamps it when it is — see
 * `error/credentialStale.ts` for why the verdict has to be recorded at the call site.
 *
 * A class rather than a closure inside the client because the decision has three collaborators
 * (the staleness port, the offline probe, the marker) and is worth testing on its own terms;
 * `createHttpClient` is the only place that constructs it.
 */
export class CredentialFailureAttributor implements IFailureAttributor {
    constructor(
        private readonly ports: HttpRuntimePorts,
        private readonly marker: IStaleCredentialMarker = staleCredentialMarker
    ) {}

    attribute(error: unknown, ctx: SigningContext): unknown {
        if (!ctx.signed || !this.ports.isCredentialStale?.(ctx.route)) return error;
        // Offline disqualifies it: every request dies with the same status-less error whether the
        // credential is good or not, and calling that an auth problem would send the app chasing a
        // refresh it cannot complete.
        if (isBrowserOffline()) return error;
        return this.marker.mark(error, ctx.route);
    }
}
