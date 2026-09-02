import { webTransport } from './transport';

import { createHttpManager } from './HttpManager';
// The composition root's ONLY session imports. `http/**` is otherwise a leaf inside app-runtime,
// which is what lets `session/auth` and `data` both depend on it without closing a cycle. The rule
// mirrors `session/store/configure.ts`, the single file exempt from that folder's own import ban:
// wiring is allowed to know both sides, the modules being wired are not.
import { credentialFreshness } from '../session/auth/credentialFreshness';
import { credentialRecovery } from './credentialRecovery';

import type { HttpClient, HttpRoute } from '@chatic/http';
import type { ICredentialFreshness } from '../session/auth/credentialFreshness';
import type { CredentialStalenessPort } from './HttpManager';

/**
 * The session side of the HTTP staleness port.
 *
 * **Every route it is asked about maps to the relay credential.** Relay is the only signed route,
 * and `oauth`/`iap` sign with relay's credential because those hosts have none of their own — so the
 * route argument is accepted (the port is route-keyed) and answered from one owner. That mapping is
 * the whole reason this adapter exists rather than handing `credentialFreshness` straight to the
 * manager: the two speak different keys on purpose (see `CredentialOwner`).
 *
 * Every read goes through the session on each call, never through a field captured at construction:
 * a credential rotation (relogin, refresh writeback) has to land on the very next request without
 * rebuilding the manager.
 */
class SessionCredentialAdapter implements CredentialStalenessPort {
    constructor(private readonly freshness: ICredentialFreshness) {}

    isStale(_route: HttpRoute): boolean {
        return this.freshness.isStale('relay');
    }

    /**
     * Routed through the late-bound registry rather than imported: the relay refresh sits downstream
     * of this composition root. See `credentialRecovery.ts` for the ring that forces the indirection.
     */
    recover(route: HttpRoute): Promise<boolean> {
        return credentialRecovery.recover(route);
    }
}

/**
 * `HttpManager` is stateless enough to build once and reuse — same reasoning as `localFactory`'s
 * shared `IndexedDBDatabase`, just for a client instead of a connection. Built lazily (not at module
 * load) so import order never matters.
 *
 * Moved here from `data/factories/httpFactory.ts`: `session/auth` reached the manager through `data`,
 * which made `data` and `session` import each other with HTTP as the go-between. The manager belongs
 * to the http module; `data` keeps only its own data-source bundle.
 */
let httpManager: HttpClient | null = null;

export const getHttpManager = (): HttpClient => {
    if (!httpManager) {
        httpManager = createHttpManager(webTransport, new SessionCredentialAdapter(credentialFreshness));
    }
    return httpManager;
};

/** Test seam — forces the next `getHttpManager()` call to rebuild. */
export const resetHttpManager = (): void => {
    httpManager = null;
};
