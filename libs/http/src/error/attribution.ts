import { staleCredentialMarker } from './credentialStale';
import { isBrowserOffline } from '../utils/browserNetwork';

import type { IStaleCredentialMarker } from './credentialStale';
import type { HttpRoute, HttpRuntimePorts } from '../ports';

export interface SigningContext {
    route: HttpRoute;
    signed: boolean;
}

export interface IFailureAttributor {
    attribute(error: unknown, ctx: SigningContext): unknown;
}

export class CredentialFailureAttributor implements IFailureAttributor {
    constructor(
        private readonly ports: HttpRuntimePorts,
        private readonly marker: IStaleCredentialMarker = staleCredentialMarker
    ) {}

    attribute(error: unknown, ctx: SigningContext): unknown {
        if (!ctx.signed || !this.ports.isCredentialStale?.(ctx.route)) return error;
        if (isBrowserOffline()) return error;
        return this.marker.mark(error, ctx.route);
    }
}
