import { classifyError } from './classify';

import type { HttpRuntimePorts } from '../ports';

/**
 * Decides whether a failed request can be rescued by re-minting a credential, and asks the port to
 * do it. The counterpart of `IFailureAttributor`: attribution writes the verdict onto the error,
 * this one acts on it.
 *
 * Split out of the client for the same reason the attributor was — the decision has its own rules
 * (which route, whether recovery is even wired, what a failed recovery means) and deserves its own
 * tests; `HttpClientImpl` only needs "may I retry?".
 */
export interface ICredentialRecoverer {
    /** True when the credential a failure blames was re-minted and the request may be sent once more. */
    tryRecover(error: unknown): Promise<boolean>;
}

export class PortCredentialRecoverer implements ICredentialRecoverer {
    constructor(private readonly ports: HttpRuntimePorts) {}

    async tryRecover(error: unknown): Promise<boolean> {
        // `refreshRoute` is set only by the stale-credential classification, so this never fires on
        // an ordinary 4xx/5xx/offline failure — those have nothing to re-mint.
        const route = classifyError(error).refreshRoute;
        if (!route || !this.ports.recoverCredential) {
            return false;
        }
        try {
            return await this.ports.recoverCredential(route);
        } catch {
            // A recovery that throws is a FAILED recovery, never a new error to hand the caller: the
            // request's own failure is what they asked about, and replacing it would hide the reason
            // their call did not work behind an implementation detail of the refresh path.
            return false;
        }
    }
}

/**
 * The no-op recoverer. Used when no port is wired, so "recovery is unavailable" is a value rather
 * than a null check scattered through the client.
 */
export class NoCredentialRecovery implements ICredentialRecoverer {
    async tryRecover(): Promise<boolean> {
        return false;
    }
}
