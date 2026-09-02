import type { HttpRoute } from '@chatic/http';

/**
 * Late-bound "re-mint this route's signing credential" hook.
 *
 * **Why a registry instead of a plain import.** The two implementations live downstream of `http/`:
 * relay recovers through `socket/auth/requestRelaySessionRefresh`, cloud through
 * `socket/auth/renewCloudSession` → `session/auth/cloudTokens` → `data/runtime` → `DataManager` →
 * `data/factories/httpFactory` → `http/gateways` → back to `http/factory`. Importing either one from
 * the http composition root closes that ring. This module imports nothing at runtime (the single
 * import above is a type, erased at compile time), so both sides reach it without meeting.
 *
 * Unregistered is the SAFE state, not a broken one: `recover` answers false and the transport
 * reports the failure exactly as it did before. A test, or an app that never mounts the runtime
 * host, therefore loses the retry and nothing else.
 */
export type CredentialRecoveryFn = (route: HttpRoute) => Promise<boolean>;

export interface ICredentialRecoveryRegistry {
    /** Installs the implementation. Passing null unregisters (test teardown). */
    register(fn: CredentialRecoveryFn | null): void;
    /** True when the route's credential was re-minted and the caller may retry once. */
    recover(route: HttpRoute): Promise<boolean>;
}

class CredentialRecoveryRegistry implements ICredentialRecoveryRegistry {
    private fn: CredentialRecoveryFn | null = null;

    register(fn: CredentialRecoveryFn | null): void {
        this.fn = fn;
    }

    async recover(route: HttpRoute): Promise<boolean> {
        if (!this.fn) return false;
        try {
            return await this.fn(route);
        } catch {
            // A recovery that throws is a failed recovery, never a second failure for the caller to
            // handle — the original request's error is the one that matters.
            return false;
        }
    }
}

/** The process-wide registry. `connection/` installs the implementation at runtime-host load. */
export const credentialRecovery: ICredentialRecoveryRegistry = new CredentialRecoveryRegistry();
