import type { HttpRoute } from '../ports';

/**
 * The stamp a transport failure carries when a lapsed SIGNING CREDENTIAL explains it.
 *
 * **Why a stamp and not a status check.** The obvious classifier — `if (status === 401 | 403)` —
 * cannot fire on the failure it most needs to catch. API Gateway rejects a stale/absent SigV4
 * signature at its IAM layer, and that 403 carries no `access-control-allow-origin`; the browser
 * therefore withholds the whole response, and the app sees a status-less `ERR_NETWORK` ("Network
 * Error"). Route, signedness and credential state are known ONLY at the moment of the call, so the
 * transport records the verdict on the error itself and everything downstream reads it back —
 * `classifyError` turns the stamp into `refreshRoute`, and `PortCredentialRecoverer` acts on it by
 * re-minting that route's credential and letting the client replay the request once.
 *
 * The alternative — passing route/credential context alongside the error through every layer it
 * crosses — would have to reach callers that receive nothing but the error itself.
 */
export interface IStaleCredentialMarker {
    /**
     * Records that `route`'s signing credential was lapsed when this request failed. Returns the same
     * error so a caller can `throw marker.mark(e, route)`.
     */
    mark<E>(error: E, route: HttpRoute): E;
    /** The route whose credential was lapsed, or null when the error carries no stamp. */
    routeOf(error: unknown): HttpRoute | null;
    /** True when this failure is explained by a lapsed signing credential. */
    isMarked(error: unknown): boolean;
}

class StaleCredentialMarker implements IStaleCredentialMarker {
    /**
     * Non-enumerable, so the stamp never leaks into a JSON-serialized report body or a log field. The
     * key is private to this class — reading it anywhere else would be a second, unversioned contract.
     */
    private static readonly KEY = '__chaticStaleCredentialRoute';

    mark<E>(error: E, route: HttpRoute): E {
        // Silently a no-op on a non-object throw (a string, null) — there is nothing to stamp, and a
        // failure to annotate must never replace the original failure.
        if (typeof error !== 'object' || error === null) return error;
        try {
            Object.defineProperty(error, StaleCredentialMarker.KEY, {
                value: route,
                enumerable: false,
                configurable: true,
                writable: true,
            });
        } catch {
            // Frozen/sealed error object — the classification simply falls back to its status-based path.
        }
        return error;
    }

    routeOf(error: unknown): HttpRoute | null {
        const route = (error as Record<string, unknown> | null | undefined)?.[StaleCredentialMarker.KEY];
        return typeof route === 'string' ? (route as HttpRoute) : null;
    }

    isMarked(error: unknown): boolean {
        return this.routeOf(error) !== null;
    }
}

/**
 * The shared marker. Stateless (the stamp lives on the error, not here), so one instance serves the
 * whole process and `classifyError` can read a stamp written by any client instance.
 */
export const staleCredentialMarker: IStaleCredentialMarker = new StaleCredentialMarker();
