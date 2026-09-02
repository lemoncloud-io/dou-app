import { credentialRecovery } from '../http/credentialRecovery';
import { requestRelaySessionRefresh } from '../socket/auth/requestRelaySessionRefresh';

import type { HttpRoute } from '@chatic/http';

/**
 * Teaches the HTTP transport how to re-mint a lapsed signing credential.
 *
 * **Every route recovers the same way, because relay is the only credential that signs.** A relay
 * token has no parent to mint a new one from, so its only recovery is `auth.refresh` through the
 * socket that owns it (ADR-0070 불변조건 1). `oauth`/`iap` sign with that same credential — their
 * hosts have none of their own — so they take the same path.
 *
 * This used to branch on a `cloud` route that re-issued instead of refreshing. That branch is gone
 * with the route: nothing signs with the cloud credential any more, so no failed request can ever
 * blame it. Cloud re-issue is still a real operation — it just belongs to the session guard that
 * watches the cloud SOCKET (`useCloudCredentialGuard` → `renewCloudSession`), not to HTTP recovery.
 *
 * **Why this lives in `connection/`.** It is the one layer downstream of BOTH http and socket:
 * nothing inside the hub imports it, so it can reach the implementation without closing the import
 * ring described in `http/credentialRecovery.ts`.
 */
export const configureCredentialRecovery = (): void => {
    credentialRecovery.register((_route: HttpRoute) => requestRelaySessionRefresh());
};
